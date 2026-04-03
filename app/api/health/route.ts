import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import IORedis from 'ioredis'

interface ServiceCheck {
  name: string
  status: 'ok' | 'error' | 'missing'
  detail?: string
}

async function checkSupabase(): Promise<ServiceCheck> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return { name: 'Supabase', status: 'missing', detail: 'SUPABASE_URL or SUPABASE_SERVICE_KEY not set' }
  try {
    const sb = createClient(url, key)
    const { count, error } = await sb.from('yt_videos').select('*', { count: 'exact', head: true })
    if (error) return { name: 'Supabase', status: 'error', detail: error.message }
    return { name: 'Supabase', status: 'ok', detail: `${count ?? 0} videos` }
  } catch (e: any) {
    return { name: 'Supabase', status: 'error', detail: e.message }
  }
}

async function checkRedis(): Promise<ServiceCheck> {
  const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
  try {
    const r = new IORedis(url, { connectTimeout: 5000, maxRetriesPerRequest: 1, lazyConnect: true })
    await r.connect()
    await r.ping()
    await r.quit()
    return { name: 'Redis', status: 'ok', detail: url.replace(/\/\/.*@/, '//***@') }
  } catch (e: any) {
    return { name: 'Redis', status: 'error', detail: e.message?.slice(0, 100) }
  }
}

async function checkAnthropic(): Promise<ServiceCheck> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return { name: 'Anthropic (Claude)', status: 'missing', detail: 'ANTHROPIC_API_KEY not set' }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }),
    })
    if (res.ok) return { name: 'Anthropic (Claude)', status: 'ok', detail: 'API key valid' }
    const data = await res.json().catch(() => ({}))
    if (res.status === 401) return { name: 'Anthropic (Claude)', status: 'error', detail: 'Invalid API key' }
    if (res.status === 429) return { name: 'Anthropic (Claude)', status: 'ok', detail: 'Rate limited but key valid' }
    return { name: 'Anthropic (Claude)', status: 'error', detail: data.error?.message ?? `HTTP ${res.status}` }
  } catch (e: any) {
    return { name: 'Anthropic (Claude)', status: 'error', detail: e.message }
  }
}

async function checkOpenAI(): Promise<ServiceCheck> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return { name: 'OpenAI (Whisper)', status: 'missing', detail: 'OPENAI_API_KEY not set' }
  try {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${key}` },
    })
    if (res.ok) return { name: 'OpenAI (Whisper)', status: 'ok', detail: 'API key valid' }
    if (res.status === 401) return { name: 'OpenAI (Whisper)', status: 'error', detail: 'Invalid API key' }
    if (res.status === 429) return { name: 'OpenAI (Whisper)', status: 'ok', detail: 'Rate limited but key valid' }
    return { name: 'OpenAI (Whisper)', status: 'error', detail: `HTTP ${res.status}` }
  } catch (e: any) {
    return { name: 'OpenAI (Whisper)', status: 'error', detail: e.message }
  }
}

async function checkFal(): Promise<ServiceCheck> {
  const key = process.env.FAL_KEY
  if (!key) return { name: 'fal.ai (Thumbnails)', status: 'missing', detail: 'FAL_KEY not set' }
  try {
    const res = await fetch('https://queue.fal.run/fal-ai/nano-banana-2', {
      method: 'POST',
      headers: { Authorization: `Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'test', num_images: 0 }),
    })
    // 422 = validation error (expected — means auth works), 401 = bad key
    if (res.status === 401 || res.status === 403) {
      return { name: 'fal.ai (Thumbnails)', status: 'error', detail: 'Invalid API key' }
    }
    return { name: 'fal.ai (Thumbnails)', status: 'ok', detail: `Key: ${key.slice(0, 8)}...` }
  } catch (e: any) {
    return { name: 'fal.ai (Thumbnails)', status: 'error', detail: e.message }
  }
}

function checkProxy(): ServiceCheck {
  const proxy = process.env.YTDLP_PROXY
  if (!proxy) return { name: 'yt-dlp Proxy', status: 'missing', detail: 'YTDLP_PROXY not set — yt-dlp may be blocked' }
  const masked = proxy.replace(/:([^@]+)@/, ':***@')
  return { name: 'yt-dlp Proxy', status: 'ok', detail: masked }
}

function checkYouTubeOAuth(): ServiceCheck {
  const clientId = process.env.YOUTUBE_CLIENT_ID
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET
  if (!clientId || !clientSecret) return { name: 'YouTube OAuth', status: 'missing', detail: 'Client ID/Secret not set' }
  return { name: 'YouTube OAuth', status: 'ok', detail: `Client: ${clientId.slice(0, 12)}...` }
}

export async function GET() {
  const checks = await Promise.all([
    checkSupabase(),
    checkRedis(),
    checkAnthropic(),
    checkOpenAI(),
    checkFal(),
    Promise.resolve(checkProxy()),
    Promise.resolve(checkYouTubeOAuth()),
  ])

  return NextResponse.json({ services: checks, timestamp: new Date().toISOString() })
}
