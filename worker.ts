/**
 * ContentOS Worker Process
 * Runs separately from Next.js — handles all heavy processing via BullMQ queue.
 * Start with: npx tsx worker.ts
 */

import { Worker, Queue, Job } from 'bullmq'
import IORedis from 'ioredis'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from './lib/ai-models'
import { decryptSecret } from './lib/crypto-secrets'
import { initWorkerSentry, captureWorkerError } from './lib/worker-sentry'
import { logger } from './lib/logger'
import { trackUsage, type Task } from './lib/cost'

// Initialize Sentry once at process start — safe no-op if SENTRY_DSN is unset.
initWorkerSentry()
import { writeFile, unlink, mkdir, rm } from 'fs/promises'
import { createReadStream, existsSync, statSync, mkdirSync, readdirSync } from 'fs'
import { execFileSync } from 'child_process'

// YouTube video IDs are exactly 11 chars: [A-Za-z0-9_-]. Validate before any
// value flows into a child-process call, so a crafted yt_video_id stored in DB
// cannot inject shell metacharacters (fix for worker command injection).
const YT_VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/
function assertYtVideoId(id: string, label = 'ytVideoId'): void {
  if (!YT_VIDEO_ID_RE.test(id)) {
    throw new Error(`${label} invalid — expected 11-char YouTube ID`)
  }
}
import { join } from 'path'

// --- Graceful shutdown & unhandled errors ---

process.on('unhandledRejection', (reason) => {
  console.error('[worker] Unhandled rejection:', reason)
  captureWorkerError(reason, { jobName: 'unhandled_rejection' })
})

process.on('uncaughtException', (err) => {
  console.error('[worker] Uncaught exception:', err.message)
  captureWorkerError(err, { jobName: 'uncaught_exception' })
  process.exit(1)
})

process.on('SIGTERM', async () => {
  console.log('[worker] SIGTERM received, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('[worker] SIGINT received, shutting down gracefully...')
  process.exit(0)
})

// --- Config ---

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
const PROXY_URL = process.env.YTDLP_PROXY ?? ''
const CHUNK_MINUTES = 20
const MAX_FILE_SIZE = 24 * 1024 * 1024
const TMP_DIR = '/tmp/contentos-audio'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

interface ClaudeCostCtx {
  task?: Task
  videoId?: string | null
}

// Retry wrapper for Claude API (handles 529 overloaded, 429 rate limit, timeouts)
// `costCtx` is optional — when passed, the call is recorded in ai_usage.
async function claudeWithRetry(
  params: Parameters<typeof anthropic.messages.create>[0],
  maxRetries = 4,
  timeoutMs = 180000, // 3 min timeout per attempt
  onRetry?: (attempt: number, maxRetries: number, reason: string) => void,
  costCtx?: ClaudeCostCtx,
): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result: any = await Promise.race([
        anthropic.messages.create(params),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)
        ),
      ])
      // Track usage — non-blocking. Claude response shape: { usage: { input_tokens, output_tokens } }
      if (costCtx) {
        trackUsage({
          provider: 'anthropic',
          model: String(params.model),
          task: costCtx.task ?? null,
          inputTokens: result?.usage?.input_tokens,
          outputTokens: result?.usage?.output_tokens,
          videoId: costCtx.videoId ?? null,
          metadata: { attempt },
        })
      }
      return result
    } catch (err: any) {
      const status = err?.status ?? err?.error?.status
      const isRetryable =
        err?.message === 'TIMEOUT' ||
        status === 529 || status === 429 || status === 500 || status === 503 ||
        err?.message?.includes('Overloaded') || err?.message?.includes('rate_limit')

      if (isRetryable && attempt < maxRetries) {
        // Exponential backoff: 429 waits longer, 529 moderate, timeout short
        const baseDelay = status === 429 ? 60000 : status === 529 ? 30000 : 15000
        const delay = baseDelay * attempt
        const reason = err?.message === 'TIMEOUT' ? 'timeout' : `${status} ${err?.error?.type ?? 'error'}`
        console.log(`[claude] ${reason}, retry ${attempt}/${maxRetries} in ${delay / 1000}s...`)
        onRetry?.(attempt + 1, maxRetries, reason)
        await new Promise(r => setTimeout(r, delay))
        continue
      }

      // Human-readable error for common failures
      if (status === 529) throw new Error('Claude API перегружен. Попробуйте позже.')
      if (status === 429) throw new Error('Превышен лимит запросов к Claude API. Попробуйте через минуту.')
      if (err?.message === 'TIMEOUT') throw new Error(`Claude API не ответил за ${timeoutMs / 1000}с после ${maxRetries} попыток.`)
      if (err?.message?.includes('credit balance')) throw new Error('Баланс Anthropic API исчерпан. Пополните счёт на console.anthropic.com.')
      throw err
    }
  }
  throw new Error('Claude API: max retries exceeded')
}
const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })

// --- DB Helpers ---

async function updateStatus(videoId: string, status: string, errorMessage?: string) {
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (errorMessage !== undefined) update.error_message = errorMessage
  if (status !== 'error') update.error_message = null
  await supabase.from('yt_videos').update(update).eq('id', videoId)
  logger.info({ videoId, status, errorMessage: errorMessage?.slice(0, 120) }, 'video status transition')
}

async function updateProgress(videoId: string, message: string) {
  await supabase.from('yt_videos').update({
    error_message: `progress:${message}`,
    updated_at: new Date().toISOString(),
  }).eq('id', videoId)
  logger.debug({ videoId, message }, 'progress')
}

/** Periodically touch updated_at so cleanup cron doesn't kill long-running tasks */
function startHeartbeat(videoId: string, intervalMs = 60000): () => void {
  const timer = setInterval(() => {
    supabase.from('yt_videos')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', videoId)
      .then(() => null, () => null)
  }, intervalMs)
  return () => clearInterval(timer)
}

async function logJob(videoId: string, jobType: string, status: string, result?: any, error?: string) {
  const row: Record<string, unknown> = { video_id: videoId, job_type: jobType, status }
  if (result) row.result = result
  if (error) row.error = error
  if (status === 'running') row.started_at = new Date().toISOString()
  if (status === 'done' || status === 'failed') row.finished_at = new Date().toISOString()
  await supabase.from('yt_jobs').insert(row)
}

async function logChange(videoId: string, field: string, oldVal: string | null, newVal: string | null) {
  await supabase.from('yt_changes').insert({
    video_id: videoId, field, old_value: oldVal, new_value: newVal, source: 'ai',
  })
}

async function getVideo(videoId: string) {
  const { data, error } = await supabase.from('yt_videos').select('*').eq('id', videoId).single()
  if (error || !data) throw new Error(`Video not found: ${videoId}`)
  return data
}

/** Convert timecode to seconds (handles MM:SS, HH:MM:SS, and broken MM:SS where MM>59) */
function tcToSecs(t: string): number {
  const parts = t.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  // MM:SS where MM>59 means it's actually minutes (e.g. 65:00 = 65 min)
  return parts[0] * 60 + (parts[1] ?? 0)
}

/** Format seconds back to "MM:SS" or "H:MM:SS" */
function secsToTc(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** Normalize text for loose matching — lowercase, collapse whitespace/punctuation */
function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[\s.,!?;:«»"'()—–-]+/g, ' ').trim()
}

/**
 * Find the exact timestamp in transcript where the quote first appears.
 * Transcript format: "[MM:SS]\nline text\n[MM:SS]\nline text..."
 * Returns seconds of the [MM:SS] marker immediately before the matched quote,
 * or null if quote not found.
 */
function findQuoteTimestamp(quote: string, transcript: string): number | null {
  if (!quote || !transcript) return null

  const normQuote = normalizeForMatch(quote)
  if (normQuote.length < 6) return null

  // Split transcript into segments: each segment is [time, text]
  const segRe = /\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s*([^\[]*)/g
  const segments: { secs: number; text: string }[] = []
  let m: RegExpExecArray | null
  while ((m = segRe.exec(transcript)) !== null) {
    const secs = m[3]
      ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
      : Number(m[1]) * 60 + Number(m[2])
    segments.push({ secs, text: m[4] })
  }

  if (segments.length === 0) return null

  // Concatenate normalized text with position -> original segment index mapping
  let concat = ''
  const positions: number[] = [] // for each char in concat, index of segment it belongs to
  for (let i = 0; i < segments.length; i++) {
    const normText = normalizeForMatch(segments[i].text)
    if (i > 0 && concat.length > 0) concat += ' '
    for (let c = 0; c < normText.length; c++) positions.push(i)
    if (normText.length > 0) concat += normText
  }

  const idx = concat.indexOf(normQuote)
  if (idx < 0) {
    // Fuzzy fallback: try first 4 words
    const firstWords = normQuote.split(' ').slice(0, 4).join(' ')
    if (firstWords.length >= 10) {
      const idx2 = concat.indexOf(firstWords)
      if (idx2 >= 0 && idx2 < positions.length) return segments[positions[idx2]].secs
    }
    return null
  }

  if (idx < positions.length) return segments[positions[idx]].secs
  return null
}

/** Fix timecodes: derive exact timestamps from transcript_quote, drop unmatched, convert MM>59 format */
function fixTimecodes(
  timecodes: { time: string; label: string; transcript_quote?: string }[],
  durationSecs: number,
  transcript?: string,
): { time: string; label: string }[] {
  const result: { time: string; label: string }[] = []

  for (let i = 0; i < timecodes.length; i++) {
    const tc = timecodes[i]
    let fixed = tc.time

    // Fix MM:SS where MM >= 60 -> H:MM:SS
    const parts = fixed.split(':').map(Number)
    if (parts.length === 2 && parts[0] >= 60) {
      const h = Math.floor(parts[0] / 60)
      const mm = parts[0] % 60
      const ss = parts[1] ?? 0
      fixed = `${h}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    }

    // First chapter is always 00:00 by YouTube rule
    if (i === 0) {
      result.push({ time: '00:00', label: tc.label })
      continue
    }

    // Derive exact timestamp from transcript quote
    if (transcript && tc.transcript_quote) {
      const secs = findQuoteTimestamp(tc.transcript_quote, transcript)
      if (secs !== null) {
        // Check it doesn't exceed duration and is strictly after previous timecode
        if (durationSecs > 0 && secs > durationSecs) continue
        const prevSecs = result.length > 0 ? tcToSecs(result[result.length - 1].time) : 0
        if (secs <= prevSecs) continue // non-monotonic, skip
        result.push({ time: secsToTc(secs), label: tc.label })
        continue
      }
      // Quote not found in transcript — drop this timecode
      console.log(`[timecodes] Drop "${tc.label}" — quote not found: "${tc.transcript_quote.slice(0, 40)}..."`)
      continue
    }

    // No transcript or no quote — keep as-is, just validate duration
    if (durationSecs > 0 && tcToSecs(fixed) > durationSecs) continue
    result.push({ time: fixed, label: tc.label })
  }

  return result
}

async function getChannel(channelId: string) {
  const { data, error } = await supabase.from('yt_channels').select('*').eq('id', channelId).single()
  if (error || !data) throw new Error(`Channel not found: ${channelId}`)
  return data
}

// --- Transcribe ---

async function ensureTmpDir() {
  if (!existsSync(TMP_DIR)) await mkdir(TMP_DIR, { recursive: true })
}

/**
 * Refresh YouTube OAuth token with needs_reauth detection.
 * On invalid_grant: marks channel needs_reauth=true, throws.
 * On success: clears needs_reauth if it was set.
 */
async function getAccessToken(refreshToken: string, channelUuid?: string): Promise<string> {
  let res: Response
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID!,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
  } catch (err) {
    throw new Error(`Network error refreshing token: ${err}`)
  }

  const data = await res.json().catch(() => ({}))

  if (data.access_token) {
    // Clear needs_reauth on success
    if (channelUuid) {
      supabase.from('yt_channels').update({ needs_reauth: false })
        .eq('id', channelUuid).eq('needs_reauth', true).then(() => null, () => null)
    }
    return data.access_token
  }

  const error = data.error ?? ''
  const isPermanent = error === 'invalid_grant' || error === 'unauthorized_client' || error === 'invalid_client'

  if (isPermanent && channelUuid) {
    console.log(`[auth] Marking channel ${channelUuid} as needs_reauth (${error})`)
    await supabase.from('yt_channels').update({ needs_reauth: true }).eq('id', channelUuid)
  }

  throw new Error(`Token refresh failed (${error}): ${JSON.stringify(data)}`)
}

/**
 * Get access token for a channel by internal UUID.
 * Checks channel refresh_token first, then falls back to env var.
 */
async function getChannelAccessToken(channelUuid: string): Promise<string> {
  const { data: ch } = await supabase.from('yt_channels')
    .select('refresh_token').eq('id', channelUuid).single()

  const plain = ch?.refresh_token ? decryptSecret(ch.refresh_token) : null
  if (plain) {
    return getAccessToken(plain, channelUuid)
  }

  const envToken = process.env.YOUTUBE_REFRESH_TOKEN
  if (!envToken) throw new Error('No refresh token available')
  return getAccessToken(envToken)
}

function parseTtml(ttml: string): { start: number; end: number; text: string }[] {
  const segs: { start: number; end: number; text: string }[] = []
  const re = /<p[^>]+begin="([^"]+)"[^>]+end="([^"]+)"[^>]*>([\s\S]*?)<\/p>/g
  let m
  while ((m = re.exec(ttml)) !== null) {
    const text = m[3].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    segs.push({ start: parseTtmlTime(m[1]), end: parseTtmlTime(m[2]), text })
  }
  return segs
}

function parseTtmlTime(t: string): number {
  // formats: "0:00:01.234" or "00:00:01.234" or "1.234s"
  if (t.endsWith('s')) return Math.round(parseFloat(t))
  const parts = t.split(':').map(Number)
  if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2])
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1])
  return Math.round(parts[0])
}

async function fetchYouTubeCaptions(
  ytVideoId: string,
  accessToken: string,
): Promise<{ start: number; end: number; text: string }[] | null> {
  const listRes = await fetch(
    `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${ytVideoId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  const listData = await listRes.json()
  if (listRes.status === 403) {
    console.log(`[captions] Quota exceeded or forbidden, skipping captions API`)
    return null
  }
  if (!listRes.ok || !listData.items?.length) {
    console.log(`[captions] No captions found for ${ytVideoId}`)
    return null
  }

  const items = listData.items as any[]
  const pick =
    items.find(c => c.snippet.language === 'ru' && c.snippet.trackKind === 'standard') ??
    items.find(c => c.snippet.language === 'ru') ??
    items.find(c => c.snippet.trackKind === 'asr') ??
    items[0]

  console.log(`[captions] Using track: ${pick.snippet.language} / ${pick.snippet.trackKind}`)

  const dlRes = await fetch(
    `https://www.googleapis.com/youtube/v3/captions/${pick.id}?tfmt=ttml`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (!dlRes.ok) {
    console.log(`[captions] Download failed: ${dlRes.status}`)
    return null
  }

  const ttml = await dlRes.text()
  const segs = parseTtml(ttml)
  console.log(`[captions] Parsed ${segs.length} segments from TTML`)
  return segs.length > 0 ? segs : null
}

async function downloadAudio(ytVideoId: string): Promise<string> {
  assertYtVideoId(ytVideoId)
  const outPath = join(TMP_DIR, `${ytVideoId}.mp3`)
  const url = `https://www.youtube.com/watch?v=${ytVideoId}`
  const args = [
    ...(PROXY_URL ? ['--proxy', PROXY_URL] : []),
    '-x', '--audio-format', 'mp3',
    '--postprocessor-args', 'ffmpeg:-ac 1 -ab 48k',
    '-o', outPath,
    url,
  ]

  const MAX_RETRIES = 3
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[download] yt-dlp${PROXY_URL ? ' +proxy' : ''} for ${ytVideoId}${attempt > 1 ? ` (attempt ${attempt}/${MAX_RETRIES})` : ''}`)
      execFileSync('yt-dlp', args, { timeout: 600000, stdio: 'pipe' })
      if (!existsSync(outPath)) throw new Error(`Audio file not created: ${outPath}`)
      console.log(`[download] OK: ${(statSync(outPath).size / 1024 / 1024).toFixed(1)}MB`)
      return outPath
    } catch (err: any) {
      console.error(`[download] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message?.slice(0, 200)}`)
      if (attempt === MAX_RETRIES) throw new Error(`yt-dlp failed after ${MAX_RETRIES} attempts: ${err.message?.slice(0, 300)}`)
      const delay = attempt * 10000 // 10s, 20s
      console.log(`[download] Retrying in ${delay / 1000}s...`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('downloadAudio: unreachable')
}

function splitAudio(audioPath: string, ytVideoId: string): string[] {
  assertYtVideoId(ytVideoId)
  if (statSync(audioPath).size <= MAX_FILE_SIZE) return [audioPath]
  const chunkDir = join(TMP_DIR, `${ytVideoId}-chunks`)
  mkdirSync(chunkDir, { recursive: true })
  execFileSync('ffmpeg', [
    '-i', audioPath,
    '-f', 'segment',
    '-segment_time', String(CHUNK_MINUTES * 60),
    '-ac', '1', '-ab', '48k', '-y',
    join(chunkDir, 'chunk_%03d.mp3'),
  ], { timeout: 120000, stdio: 'pipe' })
  return readdirSync(chunkDir)
    .filter(f => /^chunk_\d+\.mp3$/.test(f))
    .sort()
    .map(f => join(chunkDir, f))
}

async function transcribeChunk(chunkPath: string, offset: number, videoId?: string) {
  const MAX_RETRIES = 2
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await openai.audio.transcriptions.create({
        file: createReadStream(chunkPath),
        model: 'whisper-1',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
        language: 'ru',
      })
      // Whisper is priced per audio-minute. `res.duration` is total seconds.
      const durationSec = Number((res as any).duration ?? 0)
      if (durationSec > 0) {
        trackUsage({
          provider: 'openai',
          model: 'whisper-1',
          task: 'transcribe',
          units: Math.ceil(durationSec / 60),
          videoId: videoId ?? null,
          metadata: { attempt },
        })
      }
      return ((res as any).segments ?? [])
        .map((s: any) => ({ start: Math.round(s.start + offset), end: Math.round(s.end + offset), text: s.text.trim() }))
        .filter((s: any) => s.text.length > 0)
    } catch (err: any) {
      const status = err?.status ?? err?.error?.status
      console.error(`[whisper] Attempt ${attempt}/${MAX_RETRIES} failed: ${err.message?.slice(0, 200)}`)
      if (attempt === MAX_RETRIES) throw err
      const delay = status === 429 ? 30000 : 5000
      console.log(`[whisper] Retrying in ${delay / 1000}s...`)
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('transcribeChunk: unreachable')
}

async function proofread(
  segments: { start: number; end: number; text: string }[],
  title: string,
  videoId?: string,
) {
  const BATCH = 50
  const result: typeof segments = []

  for (let i = 0; i < segments.length; i += BATCH) {
    const batch = segments.slice(i, i + BATCH)
    const numbered = batch.map((s, idx) => `${idx}|${s.text}`).join('\n')

    const msg = await claudeWithRetry({
      model: AI_MODELS.claude,
      max_tokens: 8192,
      system: `Ты — корректор транскриптов подкастов на русском языке.

КРИТИЧЕСКИ ВАЖНО:
- На входе ровно ${batch.length} строк. На выходе РОВНО ${batch.length} строк.
- Каждая строка привязана к таймкоду. НЕ объединяй, НЕ разделяй, НЕ удаляй строки.
- Если строка корректна — верни её без изменений.

Что исправлять:
1. Ошибки распознавания речи (неправильные слова, имена, термины)
2. Пунктуация (точки, запятые, вопросительные/восклицательные знаки)
3. Регистр (начало предложений с заглавной)

Что НЕ делать:
- НЕ менять смысл, НЕ перефразировать
- НЕ добавлять/удалять слова
- НЕ менять количество строк

Формат: номер|текст
Контекст видео: "${title}"`,
      messages: [{ role: 'user', content: `Исправь. Верни РОВНО ${batch.length} строк:\n\n${numbered}` }],
    }, undefined, undefined, undefined, { task: 'proofread', videoId: videoId ?? null })

    const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const lines = text.trim().split('\n').filter((l: string) => l.includes('|'))

    for (let j = 0; j < batch.length; j++) {
      const seg = batch[j]
      const line = lines.find((l: string) => l.startsWith(`${j}|`))
      result.push({
        start: seg.start,
        end: seg.end,
        text: line ? line.substring(line.indexOf('|') + 1).trim() || seg.text : seg.text,
      })
    }
  }
  return result
}

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

async function cleanup(ytVideoId: string) {
  const p = join(TMP_DIR, `${ytVideoId}.mp3`)
  const d = join(TMP_DIR, `${ytVideoId}-chunks`)
  try { if (existsSync(p)) await unlink(p) } catch {}
  try { if (existsSync(d)) await rm(d, { recursive: true }) } catch {}
}

async function handleTranscribe(videoId: string) {
  const video = await getVideo(videoId)
  const channel = await getChannel(video.channel_id)

  // Skip if transcript already exists (re-queued by produce flow)
  if (video.transcript) {
    console.log(`[transcribe] Transcript already exists for ${video.yt_video_id}, skipping`)
    await updateStatus(videoId, 'generating')
    return
  }

  await updateStatus(videoId, 'transcribing')
  await logJob(videoId, 'transcribe', 'running')
  const stopHeartbeat = startHeartbeat(videoId)

  try {
    let allSegs: { start: number; end: number; text: string }[] = []

    // Step 1: Try YouTube Captions API — skip if channel needs_reauth (saves quota)
    if (channel.refresh_token && !channel.needs_reauth) {
      await updateProgress(videoId, 'Получение субтитров через YouTube API...')
      try {
        const accessToken = await getChannelAccessToken(video.channel_id)
        const captionSegs = await fetchYouTubeCaptions(video.yt_video_id, accessToken)
        if (captionSegs && captionSegs.length > 0) {
          allSegs = captionSegs
          console.log(`[transcribe] Using YouTube captions (${allSegs.length} segments)`)
        }
      } catch (captionErr: any) {
        console.log(`[transcribe] Captions API error: ${captionErr.message}, falling back to Whisper`)
      }
    } else if (channel.needs_reauth) {
      console.log(`[transcribe] Skipping captions API — channel needs reauth, using Whisper`)
    }

    // Step 2: Fallback to Whisper via yt-dlp
    if (allSegs.length === 0) {
      await ensureTmpDir()
      await updateProgress(videoId, 'Скачивание аудио...')
      const audioPath = await downloadAudio(video.yt_video_id)
      const chunks = splitAudio(audioPath, video.yt_video_id)

      for (let i = 0; i < chunks.length; i++) {
        await updateProgress(videoId, `Расшифровка Whisper${chunks.length > 1 ? ` (${i + 1} из ${chunks.length})` : ''}...`)
        allSegs.push(...await transcribeChunk(chunks[i], i * CHUNK_MINUTES * 60, videoId))
      }
      if (allSegs.length === 0) throw new Error('Whisper returned empty transcript')
    }

    await updateProgress(videoId, 'Проверка и исправление транскрипта...')
    const corrected = await proofread(allSegs, video.current_title, videoId)
    const transcript = corrected.map(s => `[${fmtTime(s.start)}]\n${s.text}`).join('\n')
    const transcriptChunks = corrected.map(s => ({ start: s.start, end: s.end, text: s.text }))

    await supabase.from('yt_videos').update({
      transcript, transcript_chunks: transcriptChunks, updated_at: new Date().toISOString(),
    }).eq('id', videoId)

    await updateStatus(videoId, 'generating')
    await logJob(videoId, 'transcribe', 'done', { length: transcript.length, chunks: transcriptChunks.length })
    console.log(`[transcribe] OK: ${video.yt_video_id} (${transcriptChunks.length} segments)`)
  } catch (err: any) {
    console.error(`[transcribe] FAIL:`, err.message)
    await updateStatus(videoId, 'error', err.message)
    await logJob(videoId, 'transcribe', 'failed', undefined, err.message)
  } finally {
    stopHeartbeat()
    await cleanup(video.yt_video_id)
  }
}

// --- Generate ---

function buildSystemPrompt(rules: any): string {
  return `Ты — AI-ассистент YouTube-канала. Твоя задача — оптимизировать метаданные видео на основе транскрипта.

## Правила канала
### Формат заголовка
${rules.title_format}
### Шаблон описания
${rules.description_template}
### Обязательные ссылки
${(rules.required_links ?? []).map((l: string) => `- ${l}`).join('\n')}
### Фиксированные хештеги
${(rules.hashtags_fixed ?? []).join(' ')}
### Нарезка
- Shorts: ${rules.shorts_count}, клип макс: ${rules.clip_max_minutes} мин

## Формат ответа
Верни ТОЛЬКО валидный JSON:
{
  "title": "Заголовок",
  "description": "Описание с ссылками и хештегами",
  "tags": ["тег1", "тег2"],
  "timecodes": [{"time": "00:00", "label": "Начало"}],
  "clips": [{"start": 120, "end": 180, "title": "Клип", "type": "short"}],
  "ai_score": 85
}

Правила: заголовок макс 100 символов, до 15 тегов, минимум 5 тайм-кодов для видео >10 мин.`
}

async function handleGenerate(videoId: string) {
  const video = await getVideo(videoId)
  const channel = await getChannel(video.channel_id)
  const rules = channel.rules

  if (!video.transcript) throw new Error('No transcript')

  await updateStatus(videoId, 'generating')
  await logJob(videoId, 'generate', 'running')
  const stopHeartbeat = startHeartbeat(videoId)

  try {
    const durationMin = Math.round(video.duration_seconds / 60)
    const transcript = video.transcript.length > 100000
      ? video.transcript.slice(0, 100000) + '\n\n[...обрезано...]'
      : video.transcript

    const msg = await claudeWithRetry({
      model: AI_MODELS.claude,
      max_tokens: 4096,
      system: buildSystemPrompt(rules),
      messages: [{
        role: 'user',
        content: `## Видео\n**Заголовок:** ${video.current_title}\n**Длительность:** ${durationMin} мин\n**Описание:** ${video.current_description || '(пусто)'}\n\n## Транскрипт\n${transcript}\n\n---\nСгенерируй JSON.`,
      }],
    }, undefined, undefined, undefined, { task: 'generate', videoId })

    const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in Claude response')
    const result = JSON.parse(jsonMatch[0])
    if (!result.title || !result.description) throw new Error('Missing required fields')

    const validTimecodes = fixTimecodes(result.timecodes ?? [], video.duration_seconds ?? 0, video.transcript)

    await supabase.from('yt_videos').update({
      generated_title: result.title,
      generated_description: result.description,
      generated_tags: result.tags ?? [],
      generated_timecodes: validTimecodes,
      generated_clips: result.clips ?? [],
      ai_score: result.ai_score ?? null,
      updated_at: new Date().toISOString(),
    }).eq('id', videoId)

    await logChange(videoId, 'title', video.current_title, result.title)
    await logChange(videoId, 'description', video.current_description, result.description)

    await updateStatus(videoId, 'thumbnail')
    await logJob(videoId, 'generate', 'done', { title: result.title, score: result.ai_score })
    console.log(`[generate] OK: ${result.title} (score: ${result.ai_score})`)
  } catch (err: any) {
    console.error(`[generate] FAIL:`, err.message)
    await updateStatus(videoId, 'error', err.message)
    await logJob(videoId, 'generate', 'failed', undefined, err.message)
  } finally {
    stopHeartbeat()
  }
}

// --- Thumbnail ---

async function handleThumbnail(videoId: string) {
  const video = await getVideo(videoId)
  if (!video.generated_title) throw new Error('No generated title')

  await updateStatus(videoId, 'thumbnail')
  await logJob(videoId, 'thumbnail', 'running')

  try {
    const prompt = `YouTube thumbnail, professional, bold text: "${video.generated_title}". Topic: ${(video.generated_description ?? video.current_title).slice(0, 200)}. Modern, eye-catching.`

    const res = await fetch('https://external.api.recraft.ai/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RECRAFT_API_KEY}` },
      body: JSON.stringify({ prompt, style: 'realistic_image', size: '1365x1024', n: 1 }),
    })
    if (!res.ok) throw new Error(`Recraft: ${res.status} ${await res.text()}`)

    const data = await res.json()
    const imageUrl = data.data?.[0]?.url
    if (!imageUrl) throw new Error('No image URL from Recraft')

    const imgRes = await fetch(imageUrl)
    const imgBuf = Buffer.from(await imgRes.arrayBuffer())

    await supabase.storage.from('thumbnails').upload(`${videoId}.png`, imgBuf, { contentType: 'image/png', upsert: true })
    const { data: pub } = supabase.storage.from('thumbnails').getPublicUrl(`${videoId}.png`)

    await supabase.from('yt_videos').update({ thumbnail_url: pub.publicUrl, updated_at: new Date().toISOString() }).eq('id', videoId)

    await updateStatus(videoId, 'review')
    await logJob(videoId, 'thumbnail', 'done', { url: pub.publicUrl })
    console.log(`[thumbnail] OK: ${pub.publicUrl}`)
  } catch (err: any) {
    console.error(`[thumbnail] FAIL:`, err.message)
    await updateStatus(videoId, 'error', err.message)
    await logJob(videoId, 'thumbnail', 'failed', undefined, err.message)
  }
}

// --- Publish ---

const YOUTUBE_ERROR_MAP: Record<string, string> = {
  'UPDATE_TITLE_NOT_ALLOWED_DURING_TEST_AND_COMPARE': 'Видео участвует в A/B тесте заголовков. Завершите тест в YouTube Studio, затем повторите публикацию.',
  'VIDEO_NOT_FOUND': 'Видео не найдено на YouTube. Возможно, оно удалено.',
  'FORBIDDEN': 'Нет прав на редактирование этого видео. Проверьте, что аккаунт подключён.',
  'quotaExceeded': 'Лимит YouTube API исчерпан. Попробуйте завтра.',
  'rateLimitExceeded': 'Слишком много запросов к YouTube. Подождите пару минут.',
  'invalidMetadata': 'Некорректные метаданные (заголовок/описание/теги). Проверьте длину и символы.',
  'processingFailure': 'YouTube не смог обработать запрос. Попробуйте позже.',
  'notVerified': 'Аккаунт не верифицирован. Загрузка обложек требует верификации канала.',
}

function humanizeYouTubeError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body)
    const errors = parsed?.error?.errors ?? []
    for (const e of errors) {
      const reason = e.reason ?? ''
      if (YOUTUBE_ERROR_MAP[reason]) return YOUTUBE_ERROR_MAP[reason]
    }
    const message = parsed?.error?.message ?? ''
    for (const [key, human] of Object.entries(YOUTUBE_ERROR_MAP)) {
      if (message.includes(key)) return human
    }
    if (message) return `YouTube: ${message}`
  } catch {}
  return `YouTube API ошибка ${status}: ${body.slice(0, 200)}`
}

async function handlePublish(videoId: string, overrides?: { title?: string; thumbnailUrl?: string }) {
  const video = await getVideo(videoId)
  if (!video.is_approved) throw new Error('Not approved')
  if (!video.generated_title) throw new Error('No generated content')

  const publishTitle = overrides?.title ?? video.generated_title
  const publishThumbnail = overrides?.thumbnailUrl ?? video.thumbnail_url

  await updateStatus(videoId, 'publishing')
  await logJob(videoId, 'publish', 'running')

  try {
    const token = await getChannelAccessToken(video.channel_id)

    const getRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${video.yt_video_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const getData = await getRes.json()
    if (!getRes.ok) {
      const errMsg = getData.error?.message ?? `HTTP ${getRes.status}`
      throw new Error(`YouTube API: ${errMsg}`)
    }
    const snippet = getData.items?.[0]?.snippet
    if (!snippet) throw new Error('Video not found on YouTube')

    // Update snippet (title, description, tags)
    const publishDescription = video.generated_description || snippet.description
    const publishTags = (video.generated_tags?.length ? video.generated_tags : null) ?? snippet.tags ?? []

    console.log(`[publish] title: ${publishTitle?.slice(0, 60)}`)
    console.log(`[publish] desc: ${publishDescription?.length ?? 0} chars`)
    console.log(`[publish] tags: ${publishTags?.length ?? 0} items: ${publishTags?.slice(0, 5).join(', ')}...`)

    const updatedSnippet: Record<string, unknown> = {
      title: publishTitle,
      description: publishDescription,
      tags: publishTags,
      categoryId: snippet.categoryId,
    }
    // Preserve defaultLanguage/defaultAudioLanguage to avoid YouTube resetting fields
    if (snippet.defaultLanguage) updatedSnippet.defaultLanguage = snippet.defaultLanguage
    if (snippet.defaultAudioLanguage) updatedSnippet.defaultAudioLanguage = snippet.defaultAudioLanguage

    const putRes = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: video.yt_video_id, snippet: updatedSnippet }),
    })
    if (!putRes.ok) {
      const errBody = await putRes.text()
      throw new Error(humanizeYouTubeError(putRes.status, errBody))
    }

    await logChange(videoId, 'title', video.current_title, publishTitle)
    await logChange(videoId, 'description', video.current_description, video.generated_description)

    // Upload thumbnail if available
    if (publishThumbnail) {
      try {
        console.log(`[publish] Uploading thumbnail: ${publishThumbnail}`)
        const imgRes = await fetch(publishThumbnail)
        if (!imgRes.ok) throw new Error(`Thumbnail fetch failed: ${imgRes.status}`)
        const imgBuf = Buffer.from(await imgRes.arrayBuffer())
        const contentType = publishThumbnail.endsWith('.png') ? 'image/png' : 'image/jpeg'

        const thumbRes = await fetch(
          `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${video.yt_video_id}&uploadType=media`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
            body: imgBuf,
          },
        )
        if (!thumbRes.ok) {
          const errText = await thumbRes.text()
          console.error(`[publish] Thumbnail upload failed: ${thumbRes.status} ${errText}`)
        } else {
          console.log(`[publish] Thumbnail uploaded OK (${(imgBuf.length / 1024).toFixed(0)} KB)`)
        }
      } catch (thumbErr: any) {
        console.error(`[publish] Thumbnail error (non-fatal):`, thumbErr.message)
      }
    }

    await supabase.from('yt_videos').update({ is_published_back: true, updated_at: new Date().toISOString() }).eq('id', videoId)

    await updateStatus(videoId, 'done')
    await logJob(videoId, 'publish', 'done', { title: publishTitle })
    console.log(`[publish] OK: ${publishTitle}`)
  } catch (err: any) {
    console.error(`[publish] FAIL:`, err.message)
    await updateStatus(videoId, 'error', err.message)
    await logJob(videoId, 'publish', 'failed', undefined, err.message)
  }
}

// --- Produce (Master Producer Agent) ---

import { buildProducerSystemPrompt, buildProducerUserPrompt } from './lib/process/prompts'

async function handleProduce(videoId: string) {
  const video = await getVideo(videoId)
  const channel = await getChannel(video.channel_id)
  const rules = channel.rules

  await updateStatus(videoId, 'producing')
  await logJob(videoId, 'produce', 'running')
  const stopHeartbeat = startHeartbeat(videoId)

  try {
    // Step 1: If no transcript, queue transcribe + delayed re-produce
    if (!video.transcript) {
      console.log('[produce] No transcript, queueing transcribe first...')
      await updateProgress(videoId, 'Транскрипт не найден, запускаем расшифровку...')
      const q = new Queue('contentos', { connection: redis })
      await q.add('transcribe', { videoId }, { attempts: 1 })
      await q.add('produce', { videoId }, { delay: 120000, attempts: 1 }) // retry produce in 2 min
      await q.close()
      return
    }

    // Step 2: Claude Producer Agent
    await updateProgress(videoId, 'AI анализ контента и генерация метаданных...')
    console.log('[produce] Calling Claude Producer Agent...')
    const durationMin = Math.round(video.duration_seconds / 60)

    const msg = await claudeWithRetry(
      {
        model: AI_MODELS.claude,
        max_tokens: 8192,
        system: buildProducerSystemPrompt(rules, durationMin),
        messages: [{
          role: 'user',
          content: buildProducerUserPrompt({
            currentTitle: video.current_title,
            currentDescription: video.current_description,
            transcript: video.transcript!,
            durationSeconds: video.duration_seconds,
          }),
        }],
      },
      2, 180000,
      (attempt, max, reason) => {
        updateProgress(videoId, `AI анализ (попытка ${attempt}/${max}, ${reason})...`)
      },
      { task: 'produce', videoId },
    )

    const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in producer response')

    const output = JSON.parse(jsonMatch[0])

    // Validate required fields
    if (!output.title_variants?.length || !output.description) {
      throw new Error('Missing required fields in producer output')
    }

    // Fix timecodes: convert 65:00 -> 1:05:00, filter exceeding duration
    if (output.timecodes?.length) {
      output.timecodes = fixTimecodes(output.timecodes, video.duration_seconds ?? 0, video.transcript)
    }

    console.log(`[produce] Got ${output.title_variants.length} titles, ${output.clip_suggestions?.length ?? 0} clips, ${output.short_suggestions?.length ?? 0} shorts, ${output.timecodes?.length ?? 0} timecodes`)
    await updateProgress(videoId, 'Сохранение результатов...')

    // Thumbnails: NOT auto-generated. User creates via Thumbnail Studio (fal.ai)
    // Producer only saves thumbnail_spec (prompt + text variants)

    // Step 3: Save producer output + copy tags/description to top-level fields for publish
    const recommendedTitle = output.title_variants?.find((v: any) => v.is_recommended)?.text
      ?? output.title_variants?.[0]?.text
      ?? null

    await supabase.from('yt_videos').update({
      producer_output: output,
      selected_variants: { title_index: null, thumbnail_text_index: null, clips_selected: [], shorts_selected: [] },
      ai_score: output.ai_score,
      generated_description: output.description ?? null,
      generated_tags: output.tags?.length ? output.tags : null,
      ...(recommendedTitle ? { generated_title: recommendedTitle } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', videoId)

    // Step 5: Save social drafts (bulk upsert, relies on UNIQUE(video_id,platform) from migration 006)
    if (output.social_drafts?.length) {
      const rows = output.social_drafts.map((draft: any) => ({
        video_id: videoId,
        platform: draft.platform,
        content: draft.content,
        status: 'draft',
      }))
      await supabase.from('yt_social_drafts').upsert(rows, { onConflict: 'video_id,platform' })
    }

    await updateStatus(videoId, 'review')
    await logJob(videoId, 'produce', 'done', {
      titles: output.title_variants.length,
      clips: output.clip_suggestions?.length ?? 0,
      shorts: output.short_suggestions?.length ?? 0,
      thumbnails: 0,
      score: output.ai_score,
    })

    const bestTitle = output.title_variants?.find((t: any) => t.is_recommended)?.text ?? output.title_variants?.[0]?.text ?? 'untitled'
    console.log(`[produce] OK: ${bestTitle} (score: ${output.ai_score})`)

  } catch (err: any) {
    console.error(`[produce] FAIL:`, err.message)
    await updateStatus(videoId, 'error', err.message)
    await logJob(videoId, 'produce', 'failed', undefined, err.message)
  } finally {
    stopHeartbeat()
  }
}

// --- ClipOS: Analyze clips ---

async function handleAnalyzeClips(videoId: string) {
  const video = await getVideo(videoId)
  if (!video.transcript) throw new Error('No transcript for clip analysis')

  console.log(`[clips] Analyzing ${video.current_title?.slice(0, 50)}...`)

  const durationMin = Math.round(video.duration_seconds / 60)
  const maxClips = durationMin > 60 ? 15 : durationMin > 30 ? 10 : 7

  const msg = await claudeWithRetry({
    model: AI_MODELS.claude,
    max_tokens: 16384,
    system: `Ты — эксперт по созданию вирусного контента из подкастов и видео.

Проанализируй транскрипт и найди ${maxClips} лучших моментов для клипов (30–90 сек).

ПРАВИЛА ОТБОРА:
1. Клип 30–90 сек: один момент с чётким хуком в первые 3 секунды
2. Первые слова должны цеплять без контекста
3. Информационная плотность: факт + цифра + вывод за 30 секунд
4. Зритель должен мочь пересказать суть одним предложением

ПАТТЕРНЫ ВИРУСНОСТИ (приоритизируй):
- counter_intuitive: «все думают X, но на самом деле Y»
- shock_statistic: конкретная цифра, которая удивляет
- personal_revelation: личная история, уязвимость, откровение
- conflict_disagreement: несогласие между спикерами
- practical_protocol: конкретный совет с шагами
- emotional_peak: смех, слёзы, пауза перед важным словом
- humor_unexpected: неожиданный поворот, самоирония

СКОРИНГ каждого кандидата (0–100):
- hook: есть ли хук в первые 3 сек
- emotional_peak: эмоциональный пик
- information_density: факт+цифра+вывод
- standalone_value: понятно без контекста
- virality_potential: итоговый скор

Длительность видео: ${durationMin} мин. ТАЙМКОДЫ не должны превышать ${video.duration_seconds} секунд.

ФОРМАТ: верни ТОЛЬКО валидный JSON массив (без markdown):
[{
  "start_time": 125,
  "end_time": 185,
  "clip_type": "short",
  "pattern_type": "counter_intuitive",
  "scores": { "hook": 90, "emotional_peak": 75, "information_density": 85, "standalone_value": 80, "virality_potential": 88 },
  "hook_phrase": "Первая фраза клипа...",
  "one_sentence_value": "Суть за одно предложение",
  "suggested_titles": ["Заголовок 1", "Заголовок 2", "Заголовок 3"],
  "suggested_thumbnail_text": ["2 СЛОВА", "ВАРИАНТ 2"],
  "transcript_excerpt": "Цитата из транскрипта...",
  "context_notes": "Почему этот момент интересен"
}]`,
    messages: [{
      role: 'user',
      content: `Видео: "${video.current_title}"\n\nТРАНСКРИПТ:\n${video.transcript.slice(0, 80000)}`,
    }],
  }, undefined, undefined, undefined, { task: 'clip_scoring', videoId })

  const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('No JSON array in Claude response')

  // Robust JSON parsing: fix common issues
  let candidates: any[]
  let rawJson = jsonMatch[0]

  // If JSON was truncated (no closing bracket), try to fix
  const openBrackets = (rawJson.match(/\[/g) || []).length
  const closeBrackets = (rawJson.match(/\]/g) || []).length
  if (openBrackets > closeBrackets) {
    // Find last complete object and close the array
    const lastComplete = rawJson.lastIndexOf('}')
    if (lastComplete > 0) {
      rawJson = rawJson.slice(0, lastComplete + 1) + ']'
    }
  }

  try {
    candidates = JSON.parse(rawJson)
  } catch {
    const cleaned = rawJson
      .replace(/,\s*([}\]])/g, '$1')          // trailing commas
      .replace(/[\x00-\x1f]/g, ' ')            // control chars
      .replace(/\\'/g, "'")                     // escaped single quotes
    try {
      candidates = JSON.parse(cleaned)
    } catch (e2: any) {
      console.error('[clips] JSON parse failed, raw length:', text.length, 'json length:', rawJson.length)
      throw new Error(`Invalid JSON from Claude: ${e2.message}`)
    }
  }
  console.log(`[clips] Found ${candidates.length} candidates`)

  // Save to DB
  for (const c of candidates) {
    await supabase.from('clip_candidates').insert({
      video_id: videoId,
      start_time: c.start_time,
      end_time: c.end_time,
      clip_type: c.clip_type ?? 'short',
      pattern_type: c.pattern_type,
      scores: c.scores ?? {},
      hook_phrase: c.hook_phrase,
      one_sentence_value: c.one_sentence_value,
      suggested_titles: c.suggested_titles ?? [],
      suggested_thumbnail_text: c.suggested_thumbnail_text ?? [],
      transcript_excerpt: c.transcript_excerpt,
      context_notes: c.context_notes,
      status: 'candidate',
    })
  }

  console.log(`[clips] Saved ${candidates.length} candidates for ${videoId}`)
}

// --- ClipOS: Process clip (FFmpeg) ---

async function handleProcessClip(_videoId: string, data?: any) {
  const candidateId = data?.candidateId
  if (!candidateId) throw new Error('candidateId required')

  const { data: candidate, error: cErr } = await supabase
    .from('clip_candidates')
    .select('*, yt_videos!inner(yt_video_id, current_title, channel_id)')
    .eq('id', candidateId)
    .single()

  if (cErr || !candidate) throw new Error(`Candidate not found: ${candidateId}`)

  const ytVideoId = (candidate as any).yt_videos.yt_video_id
  const channelId = (candidate as any).yt_videos.channel_id
  const tmpDir = '/tmp/clips'
  await mkdir(tmpDir, { recursive: true })

  const rawFile = join(tmpDir, `${candidateId}_raw.mp4`)
  const vertFile = join(tmpDir, `${candidateId}_vert.mp4`)

  try {
    console.log(`[clips] Downloading fragment ${candidate.start_time}-${candidate.end_time}s from ${ytVideoId}`)

    // Step 1: Download full video once, cache it, then cut fragment with FFmpeg
    const fullVideoFile = join(tmpDir, `${candidate.video_id}_full.mp4`)

    assertYtVideoId(ytVideoId)

    if (!existsSync(fullVideoFile)) {
      console.log(`[clips] Downloading full video ${ytVideoId}...`)

      // yt-dlp downloads public videos without auth; proxy handles geo-blocks
      execFileSync('yt-dlp', [
        '-f', 'bestvideo[height<=720]+bestaudio/best[height<=720]',
        '-o', fullVideoFile,
        '--merge-output-format', 'mp4',
        '--no-warnings',
        ...(PROXY_URL ? ['--proxy', PROXY_URL] : []),
        `https://youtube.com/watch?v=${ytVideoId}`,
      ], { timeout: 600000 })

      if (!existsSync(fullVideoFile)) throw new Error('yt-dlp download failed')
      console.log(`[clips] Full video: ${(statSync(fullVideoFile).size / 1024 / 1024).toFixed(0)}MB`)
    } else {
      console.log(`[clips] Using cached full video`)
    }

    // Cut the fragment from full video
    const startSec = Math.max(0, Math.floor(candidate.start_time) - 1)
    const duration = Math.ceil(candidate.end_time - candidate.start_time) + 2

    execFileSync('ffmpeg', [
      '-y', '-ss', String(startSec),
      '-i', fullVideoFile,
      '-t', String(duration),
      '-c:v', 'libx264', '-crf', '22', '-preset', 'fast',
      '-c:a', 'aac', '-b:a', '128k',
      rawFile,
    ], { timeout: 120000 })

    if (!existsSync(rawFile)) throw new Error('yt-dlp download failed')
    const rawSize = statSync(rawFile).size
    console.log(`[clips] Downloaded: ${(rawSize / 1024 / 1024).toFixed(1)}MB`)

    // Step 2: Crop to 9:16 vertical
    console.log(`[clips] Cropping to 9:16...`)
    execFileSync('ffmpeg', [
      '-y', '-i', rawFile,
      '-vf', 'crop=ih*(9/16):ih,scale=1080:1920',
      '-c:v', 'libx264', '-crf', '20', '-preset', 'fast',
      '-c:a', 'aac', '-b:a', '128k',
      vertFile,
    ], { timeout: 300000 })

    if (!existsSync(vertFile)) throw new Error('FFmpeg crop failed')

    // Step 3: Upload to Supabase Storage
    const { readFileSync } = await import('fs')
    const fileBuffer = readFileSync(vertFile)
    const storagePath = `clips/${candidate.video_id}/${candidateId}.mp4`

    await supabase.storage.from('thumbnails').upload(storagePath, fileBuffer, {
      contentType: 'video/mp4',
      upsert: true,
    })

    const { data: pub } = supabase.storage.from('thumbnails').getPublicUrl(storagePath)

    // Step 4: Update candidate
    await supabase.from('clip_candidates').update({
      status: 'done',
      output_url: pub.publicUrl,
      output_path: storagePath,
      updated_at: new Date().toISOString(),
    }).eq('id', candidateId)

    console.log(`[clips] Done: ${pub.publicUrl}`)
  } catch (err: any) {
    console.error(`[clips] Process failed:`, err.message)
    await supabase.from('clip_candidates').update({
      status: 'failed',
      error_message: err.message?.slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq('id', candidateId)
    throw err
  } finally {
    // Cleanup tmp files
    try { await unlink(rawFile) } catch {}
    try { await unlink(vertFile) } catch {}
  }
}

// --- Telegram send ---

async function handleTelegramSend(postId: string) {
  const { sendTelegramPost } = await import('./lib/telegram/sender')
  await sendTelegramPost(postId)
}

// --- Newsletter Stats ---

async function handleNewsletterStats() {
  console.log('[newsletter_stats] Fetching campaign stats...')

  const { data: campaigns } = await supabase
    .from('nl_campaigns')
    .select('id, unisender_campaign_id, issue_id')
    .in('status', ['scheduled', 'sent'])
    .not('unisender_campaign_id', 'is', null)

  if (!campaigns || campaigns.length === 0) {
    console.log('[newsletter_stats] No campaigns to update')
    return
  }

  const API_BASE = 'https://api.unisender.com/ru/api'
  const apiKey = process.env.UNISENDER_API_KEY
  if (!apiKey) {
    console.log('[newsletter_stats] UNISENDER_API_KEY not set, skipping')
    return
  }

  for (const campaign of campaigns) {
    try {
      // Check campaign status
      const statusRes = await fetch(
        `${API_BASE}/getCampaignStatus?format=json&api_key=${apiKey}&campaign_id=${campaign.unisender_campaign_id}`
      )
      const statusData = await statusRes.json()
      const campStatus = statusData.result?.status

      if (campStatus === 'completed' || campStatus === 'analysed') {
        // Fetch stats
        const statsRes = await fetch(
          `${API_BASE}/getCampaignCommonStats?format=json&api_key=${apiKey}&campaign_id=${campaign.unisender_campaign_id}`
        )
        const statsData = await statsRes.json()
        const stats = statsData.result

        if (stats) {
          const openRate = stats.delivered > 0
            ? Math.round((stats.read_unique / stats.delivered) * 10000) / 100
            : 0
          const clickRate = stats.delivered > 0
            ? Math.round((stats.clicked_unique / stats.delivered) * 10000) / 100
            : 0

          await supabase
            .from('nl_campaigns')
            .update({
              status: 'sent',
              total_sent: stats.sent,
              total_delivered: stats.delivered,
              total_opened: stats.read_unique,
              total_clicked: stats.clicked_unique,
              total_unsubscribed: stats.unsubscribed,
              open_rate: openRate,
              click_rate: clickRate,
              raw_stats: stats,
              stats_fetched_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', campaign.id)

          // Update issue status
          await supabase
            .from('nl_issues')
            .update({
              status: 'sent',
              sent_at: statusData.result.start_time
                ? new Date(statusData.result.start_time + 'Z').toISOString()
                : new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', campaign.issue_id)

          console.log(`[newsletter_stats] Updated campaign ${campaign.unisender_campaign_id}: OR=${openRate}% CR=${clickRate}%`)
        }
      }
    } catch (err: any) {
      console.error(`[newsletter_stats] Error for campaign ${campaign.unisender_campaign_id}:`, err.message)
    }
  }
}

// --- Generate Short Title ---

async function handleGenerateShortTitle(videoId: string) {
  const video = await getVideo(videoId)
  const channel = await getChannel(video.channel_id)

  // Step 1: Get transcript if missing — use YouTube Captions API
  let transcript = video.transcript
  if (!transcript) {
    try {
      if (channel.refresh_token && !channel.needs_reauth) {
        const accessToken = await getChannelAccessToken(video.channel_id)
        const segs = await fetchYouTubeCaptions(video.yt_video_id, accessToken)
        if (segs?.length) {
          transcript = segs.map(s => s.text).join(' ')
          await supabase.from('yt_videos').update({
            transcript,
            transcript_chunks: segs,
          }).eq('id', videoId)
        }
      }
    } catch (err: any) {
      console.log(`[short_title] Captions error for ${video.yt_video_id}: ${err.message}`)
    }
  }

  // Step 2: Get parent video info for guest name / link
  let parentTitle = ''
  let parentYtId = ''
  if (video.parent_video_id) {
    try {
      const parent = await getVideo(video.parent_video_id)
      parentTitle = parent.current_title ?? ''
      parentYtId = parent.yt_video_id
    } catch {}
  }

  const guestName = video.guest_name ?? extractGuestFromTitle(video.current_title ?? '')
  const rules = channel.rules ?? {}

  // Step 3: Claude generates new title + description
  const prompt = `Ты оптимизируешь заголовки YouTube Shorts.

Текущий заголовок: "${video.current_title}"
${transcript ? `Субтитры (что говорится в шортсе): "${transcript.slice(0, 1500)}"` : ''}
${guestName ? `Имя гостя: ${guestName}` : ''}
${video.guest_title ? `Регалия гостя: ${video.guest_title}` : ''}
${parentTitle ? `Родительский подкаст: "${parentTitle}"` : ''}

Формат заголовка (СТРОГО):
Суть момента — Имя Гостя, регалия #shorts

Примеры хороших заголовков:
- Почему стартапы умирают — Иван Петров, предприниматель #shorts
- Три элемента счастливой жизни — Алексей Красиков, психолог #shorts
- Netflix для снов — Илья Блозин, кубик сна deep #shorts

Правила:
- Заголовок должен передавать СУТЬ того, о чём говорится в видео
- Используй субтитры чтобы понять суть, не копируй текущий заголовок
- Если регалия неизвестна, определи из контекста (психолог, предприниматель, учёный, etc.)
- Максимум 90 символов включая #shorts
- Заголовок на русском

Верни JSON:
{
  "title": "Новый заголовок #shorts",
  "guest_name": "Имя Фамилия",
  "guest_title": "регалия",
  "description": "Краткое описание (1-2 предложения)\\n\\n${parentYtId ? `Полное интервью: https://youtube.com/watch?v=${parentYtId}` : ''}\\n${(rules.required_links ?? []).join('\\n')}\\n${(rules.hashtags_fixed ?? []).join(' ')}"
}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
  })

  trackUsage({
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    task: 'short_title',
    inputTokens: (response as any)?.usage?.input_tokens,
    outputTokens: (response as any)?.usage?.output_tokens,
    videoId,
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Claude returned no JSON')

  const result = JSON.parse(jsonMatch[0])

  await supabase.from('yt_videos').update({
    generated_title: result.title,
    generated_description: result.description,
    guest_name: result.guest_name || guestName,
    guest_title: result.guest_title || video.guest_title,
    shorts_status: 'generated',
  }).eq('id', videoId)

  console.log(`[short_title] ${video.yt_video_id}: "${result.title}"`)
}

function extractGuestFromTitle(title: string): string | null {
  const clean = title.replace(/#\S+/g, '').replace(/[^\p{L}\p{N}\s:—–\-,]/gu, '').trim()
  const dashMatch = clean.match(/[—–-]\s*([А-ЯЁA-Z][а-яёa-z]+\s+[А-ЯЁA-Z][а-яёa-z]+)/)
  if (dashMatch) return dashMatch[1].trim()
  const colonMatch = clean.match(/^([А-ЯЁA-Z][а-яёa-z]+\s+[А-ЯЁA-Z][а-яёa-z]+)\s*:/)
  if (colonMatch) return colonMatch[1].trim()
  const withMatch = clean.match(/(?:с|c)\s+([А-ЯЁA-Z][а-яёa-z]+(?:\s+[А-ЯЁA-Z][а-яёa-z]+)+)/)
  if (withMatch) return withMatch[1].trim()
  return null
}

// --- Regenerate timecodes only ---

async function handleRegenerateTimecodes(videoId: string) {
  const video = await getVideo(videoId)
  if (!video.transcript) throw new Error('No transcript — run produce first')

  console.log(`[regen-timecodes] ${video.current_title?.slice(0, 50)}`)
  const stopHeartbeat = startHeartbeat(videoId)

  try {
    const durationMin = Math.round(video.duration_seconds / 60)
    const timecodesCount = durationMin > 60 ? 20 : durationMin > 30 ? 15 : 10

    const maxLen = 120000
    const transcript = video.transcript.length > maxLen
      ? video.transcript.slice(0, 80000) + '\n\n[...middle truncated...]\n\n' + video.transcript.slice(-30000)
      : video.transcript

    const msg = await claudeWithRetry({
      model: AI_MODELS.claude,
      max_tokens: 4096,
      system: `You generate YouTube chapter timecodes from a podcast transcript.

RULES:
- Generate EXACTLY ${timecodesCount} chapters.
- For each chapter you MUST return a "transcript_quote" field: the EXACT first 4-8 words from the transcript where the chapter begins. Copy verbatim, including punctuation. This will be matched against the transcript to derive the precise timestamp.
- "time" field: use "H:MM:SS" for videos >60 min, "MM:SS" for shorter. Never MM>59. Format must match the transcript_quote location.
- Each label = SEO searchable keyword phrase (NOT generic like "Вступление" or "Часть 2"). Russian language.
- First chapter: time="00:00", transcript_quote = first 4-8 words of transcript.
- Last timecode MUST NOT exceed ${durationMin} minutes.
- If you cannot find exact starting words for a chapter, SKIP it. Better fewer accurate chapters than hallucinations.

OUTPUT: JSON only (no markdown fences):
{
  "timecodes": [
    {"time": "00:00", "label": "Chapter title", "transcript_quote": "exact first 4-8 words from transcript"}
  ]
}`,
      messages: [{
        role: 'user',
        content: `Video duration: ${durationMin} min.\n\nTranscript:\n${transcript}\n\nReturn JSON with ${timecodesCount} timecodes.`,
      }],
    }, undefined, undefined, undefined, { task: 'other', videoId })

    const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in Claude response')
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed.timecodes)) throw new Error('Missing timecodes array')

    const fixed = fixTimecodes(parsed.timecodes, video.duration_seconds ?? 0, video.transcript)
    console.log(`[regen-timecodes] Got ${parsed.timecodes.length} from Claude, ${fixed.length} after verification`)

    const po = { ...(video.producer_output ?? {}), timecodes: fixed }
    await supabase.from('yt_videos').update({
      producer_output: po,
      updated_at: new Date().toISOString(),
    }).eq('id', videoId)

    await logJob(videoId, 'regenerate_timecodes', 'done', { count: fixed.length })
    console.log(`[regen-timecodes] OK: ${fixed.length} timecodes`)
  } catch (err: any) {
    console.error(`[regen-timecodes] FAIL:`, err.message)
    await logJob(videoId, 'regenerate_timecodes', 'failed', undefined, err.message)
    throw err
  } finally {
    stopHeartbeat()
  }
}

// --- Worker ---

const handlers: Record<string, (videoId: string, data?: any) => Promise<void>> = {
  transcribe: handleTranscribe,
  generate: handleGenerate,
  thumbnail: handleThumbnail,
  publish: (videoId, data) => handlePublish(videoId, data?.overrides),
  produce: handleProduce,
  analyze_clips: handleAnalyzeClips,
  process_clip: (videoId, data) => handleProcessClip(videoId, data),
  telegram_send: (_videoId, data) => handleTelegramSend(data?.postId),
  newsletter_stats: () => handleNewsletterStats(),
  generate_short_title: handleGenerateShortTitle,
  regenerate_timecodes: handleRegenerateTimecodes,
}

// --- Stale job cleanup ---
// Transcribing can take 15+ min for long podcasts (Whisper chunks), so use 30 min timeout.
// Other statuses use 15 min.
const STALE_TIMEOUT: Record<string, number> = {
  transcribing: 30 * 60 * 1000,
  generating: 15 * 60 * 1000,
  producing: 15 * 60 * 1000,
  publishing: 10 * 60 * 1000,
}

async function cleanupStaleJobs() {
  for (const [status, timeout] of Object.entries(STALE_TIMEOUT)) {
    const cutoff = new Date(Date.now() - timeout).toISOString()
    const { data: stale } = await supabase
      .from('yt_videos')
      .select('id, status, current_title')
      .eq('status', status)
      .lt('updated_at', cutoff)

    if (stale?.length) {
      for (const v of stale) {
        const mins = Math.round(timeout / 60000)
        console.log(`[cleanup] Resetting stale ${v.status} (>${mins}min): ${v.current_title?.slice(0, 50)}`)
        await updateStatus(v.id, 'error', `Таймаут: зависло на "${v.status}" более ${mins} минут`)
      }
    }
  }

  // Clear stuck thumbnail_generating flags (>5 min old)
  const thumbCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const { data: thumbStale } = await supabase
    .from('yt_videos')
    .select('id, producer_output, current_title')
    .not('producer_output->thumbnail_generating', 'is', null)
    .lt('updated_at', thumbCutoff)

  if (thumbStale?.length) {
    for (const v of thumbStale) {
      const po = { ...(v.producer_output ?? {}), thumbnail_generating: null }
      await supabase.from('yt_videos').update({
        producer_output: po,
        updated_at: new Date().toISOString(),
      }).eq('id', v.id)
      console.log(`[cleanup] Cleared stuck thumbnail_generating: ${v.current_title?.slice(0, 50)}`)
    }
  }
}

const worker = new Worker(
  'contentos',
  async (job: Job) => {
    const handler = handlers[job.name]
    if (!handler) throw new Error(`Unknown job: ${job.name}`)
    const videoId = job.data.videoId
    const jobId = videoId ?? job.data.postId ?? 'unknown'
    const jobLog = logger.child({
      module: 'worker',
      jobName: job.name,
      bullmqJobId: job.id,
      videoId,
      attempt: job.attemptsMade,
    })
    const started = Date.now()
    jobLog.info('job start')
    try {
      await handler(videoId, job.data)
      jobLog.info({ duration_ms: Date.now() - started }, 'job done')
    } catch (err: any) {
      const msg = err.message ?? 'Unknown error'
      jobLog.error({ err: msg, duration_ms: Date.now() - started }, 'job failed')
      captureWorkerError(err, {
        jobId: job.id,
        jobName: job.name,
        videoId,
        attempt: job.attemptsMade,
      })
      if (videoId) {
        try {
          await updateStatus(videoId, 'error', msg.slice(0, 500))
        } catch {}
      }
      throw err
    }
  },
  {
    connection: redis,
    concurrency: 4,
    lockDuration: 480000,
    lockRenewTime: 30000,
    settings: {
      backoffStrategy: () => 0, // no auto-retry delay
    },
  },
)

worker.on('failed', (job, err) => {
  console.error(`[worker] Job ${job?.name} failed:`, err.message)
})

worker.on('completed', (job) => {
  console.log(`[worker] Job ${job.name} completed`)
})

// Cleanup stale jobs on start and every 5 minutes
cleanupStaleJobs()
setInterval(cleanupStaleJobs, 5 * 60 * 1000)

// Newsletter stats cron — every 6 hours
const nlQueue = new Queue('contentos', { connection: redis })
async function scheduleNewsletterStats() {
  try {
    await nlQueue.add('newsletter_stats', {}, {
      repeat: { every: 6 * 60 * 60 * 1000 },
      jobId: 'newsletter_stats_cron',
    })
    console.log('[worker] Newsletter stats cron scheduled (every 6h)')
  } catch {}
}
scheduleNewsletterStats()

console.log('[worker] ContentOS worker started (concurrency=4). Waiting for jobs...')
