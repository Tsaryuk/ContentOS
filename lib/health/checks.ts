// lib/health/checks.ts
// Проверки, которые ловят РЕАЛЬНЫЕ отказы этого сервиса.
//
// Предыдущая версия health-роута была зелёной насквозь через два отказа,
// длившихся 12 и 14 дней:
//   * она делала только SELECT, а ломались записи — RLS отказывает не кодом
//     4xx, а пустым результатом;
//   * SELECT шёл по yt_videos — единственной таблице с разрешающей политикой
//     для anon, поэтому даже с ключом уровня anon отвечал «ok»;
//   * прокси проверялся по факту наличия переменной, без единого подключения,
//     поэтому 402 Payment Required был невидим;
//   * пульса воркера не было вовсе.
//
// Отсюда правила: писать, а не только читать; писать в таблицу БЕЗ политик;
// ходить по сети там, где отказ бывает сетевым.

import net from 'net'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import IORedis from 'ioredis'

export interface ServiceCheck {
  name: string
  status: 'ok' | 'error' | 'missing'
  detail?: string
  /** Отказ этой проверки означает, что сервис нерабочий (для внешнего монитора). */
  critical?: boolean
}

const WORKER_STALE_MS = 15 * 60 * 1000

function admin(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

/**
 * Круговая проверка записи: пишем метку в system_heartbeat и читаем обратно.
 * Таблица без политик, поэтому ключ уровня anon здесь провалится — ровно тот
 * отказ, который две недели никто не видел.
 */
export async function checkDbWrite(): Promise<ServiceCheck> {
  const name = 'Supabase (запись)'
  const sb = admin()
  if (!sb) return { name, status: 'missing', detail: 'SUPABASE_URL или SUPABASE_SERVICE_KEY не заданы', critical: true }

  const marker = new Date().toISOString()
  try {
    const { error: upErr } = await sb
      .from('system_heartbeat')
      .upsert({ component: 'healthcheck', beat_at: marker, detail: 'api/health' }, { onConflict: 'component' })
    if (upErr) return { name, status: 'error', detail: upErr.message.slice(0, 140), critical: true }

    const { data, error: selErr } = await sb
      .from('system_heartbeat')
      .select('beat_at')
      .eq('component', 'healthcheck')
      .maybeSingle()
    if (selErr) return { name, status: 'error', detail: selErr.message.slice(0, 140), critical: true }
    if (!data) {
      return { name, status: 'error', detail: 'запись не вернулась — вероятно ключ не service_role', critical: true }
    }
    if (new Date(data.beat_at).getTime() !== new Date(marker).getTime()) {
      return { name, status: 'error', detail: 'запись не применилась (RLS молча отклонил)', critical: true }
    }
    return { name, status: 'ok', detail: 'запись и чтение прошли', critical: true }
  } catch (e: unknown) {
    return { name, status: 'error', detail: (e instanceof Error ? e.message : 'ошибка').slice(0, 140), critical: true }
  }
}

export async function checkWorkerHeartbeat(): Promise<ServiceCheck> {
  const name = 'Воркер (пульс)'
  const sb = admin()
  if (!sb) return { name, status: 'missing', detail: 'нет доступа к БД', critical: true }
  try {
    const { data, error } = await sb
      .from('system_heartbeat')
      .select('beat_at, detail')
      .eq('component', 'worker')
      .maybeSingle()
    if (error) return { name, status: 'error', detail: error.message.slice(0, 140), critical: true }
    if (!data) return { name, status: 'error', detail: 'пульса нет — воркер ни разу не отметился', critical: true }

    const ageMs = Date.now() - new Date(data.beat_at).getTime()
    const ageMin = Math.round(ageMs / 60000)
    if (ageMs > WORKER_STALE_MS) {
      return { name, status: 'error', detail: `молчит ${ageMin} мин (порог 15)`, critical: true }
    }
    return { name, status: 'ok', detail: `${ageMin} мин назад${data.detail ? ` · ${data.detail}` : ''}`, critical: true }
  } catch (e: unknown) {
    return { name, status: 'error', detail: (e instanceof Error ? e.message : 'ошибка').slice(0, 140), critical: true }
  }
}

export async function checkRedis(): Promise<ServiceCheck> {
  const name = 'Redis'
  const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
  let r: IORedis | null = null
  try {
    r = new IORedis(url, { connectTimeout: 5000, maxRetriesPerRequest: 1, lazyConnect: true })
    await r.connect()
    await r.ping()
    return { name, status: 'ok', detail: url.replace(/\/\/.*@/, '//***@'), critical: true }
  } catch (e: unknown) {
    return { name, status: 'error', detail: (e instanceof Error ? e.message : 'ошибка').slice(0, 100), critical: true }
  } finally {
    try { await r?.quit() } catch { /* сокет уже мёртв */ }
  }
}

/**
 * Реальный CONNECT через прокси. Проверять наличие переменной бесполезно:
 * 18.08 Webshare начал отвечать 402 Payment Required, и вся выгрузка подкастов
 * встала, пока индикатор показывал «ok».
 */
export async function checkProxy(): Promise<ServiceCheck> {
  const name = 'Прокси для yt-dlp'
  const raw = process.env.YTDLP_PROXY ?? process.env.PROXY_URL ?? ''
  if (!raw) return { name, status: 'missing', detail: 'YTDLP_PROXY не задан — YouTube будет резать бот-чеком' }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return { name, status: 'error', detail: 'YTDLP_PROXY не парсится как URL' }
  }

  const host = parsed.hostname
  const port = Number(parsed.port || 80)
  const auth = parsed.username
    ? Buffer.from(`${decodeURIComponent(parsed.username)}:${decodeURIComponent(parsed.password)}`).toString('base64')
    : null

  const statusLine = await new Promise<string>((resolve) => {
    const socket = net.connect({ host, port })
    let buf = ''
    const done = (v: string) => {
      socket.destroy()
      resolve(v)
    }
    socket.setTimeout(8000, () => done('TIMEOUT'))
    socket.on('error', (e: Error) => done(`ERR ${e.message}`))
    socket.on('connect', () => {
      socket.write(
        `CONNECT www.youtube.com:443 HTTP/1.1\r\nHost: www.youtube.com:443\r\n` +
          (auth ? `Proxy-Authorization: Basic ${auth}\r\n` : '') +
          `\r\n`,
      )
    })
    socket.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8')
      if (buf.includes('\r\n')) done(buf.split('\r\n')[0])
    })
  })

  if (statusLine.startsWith('TIMEOUT')) return { name, status: 'error', detail: 'прокси не отвечает (таймаут)' }
  if (statusLine.startsWith('ERR ')) return { name, status: 'error', detail: statusLine.slice(0, 120) }
  if (/\b200\b/.test(statusLine)) return { name, status: 'ok', detail: `${host}:${port} — туннель открылся` }
  if (/\b402\b/.test(statusLine)) {
    return { name, status: 'error', detail: '402 Payment Required — кончилась оплата или трафик' }
  }
  if (/\b407\b/.test(statusLine)) return { name, status: 'error', detail: '407 — прокси не принял логин/пароль' }
  return { name, status: 'error', detail: statusLine.slice(0, 120) }
}

export async function checkYouTubeChannels(): Promise<ServiceCheck> {
  const name = 'YouTube-каналы'
  const sb = admin()
  if (!sb) return { name, status: 'missing', detail: 'нет доступа к БД' }
  try {
    const { data, error } = await sb.from('yt_channels').select('needs_reauth')
    if (error) return { name, status: 'error', detail: error.message.slice(0, 140) }
    const total = data?.length ?? 0
    const stale = (data ?? []).filter((c) => c.needs_reauth).length
    if (total === 0) return { name, status: 'missing', detail: 'каналов нет' }
    if (stale === total) return { name, status: 'error', detail: `все ${total} требуют переподключения — запись в YouTube не работает` }
    if (stale > 0) return { name, status: 'missing', detail: `${stale} из ${total} требуют переподключения` }
    return { name, status: 'ok', detail: `${total} подключены` }
  } catch (e: unknown) {
    return { name, status: 'error', detail: (e instanceof Error ? e.message : 'ошибка').slice(0, 140) }
  }
}

/** Критичные проверки — по ним внешний монитор решает, жив сервис или нет. */
export async function runCriticalChecks(): Promise<ServiceCheck[]> {
  return Promise.all([checkDbWrite(), checkRedis(), checkWorkerHeartbeat()])
}
