import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import {
  checkDbWrite,
  checkRedis,
  checkWorkerHeartbeat,
  checkProxy,
  checkYouTubeChannels,
  type ServiceCheck,
} from '@/lib/health/checks'

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
    return { name: 'fal.ai (Thumbnails)', status: 'ok', detail: 'API key valid' }
  } catch (e: any) {
    return { name: 'fal.ai (Thumbnails)', status: 'error', detail: e.message }
  }
}

function checkYouTubeOAuth(): ServiceCheck {
  const clientId = process.env.YOUTUBE_CLIENT_ID
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET
  if (!clientId || !clientSecret) return { name: 'YouTube OAuth', status: 'missing', detail: 'Client ID/Secret not set' }
  return { name: 'YouTube OAuth', status: 'ok', detail: 'Configured' }
}

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const checks = await Promise.all([
    checkDbWrite(),
    checkRedis(),
    checkWorkerHeartbeat(),
    checkProxy(),
    checkYouTubeChannels(),
    checkAnthropic(),
    checkOpenAI(),
    checkFal(),
    Promise.resolve(checkYouTubeOAuth()),
  ])

  const brokenCritical = checks.filter((c) => c.critical && c.status === 'error')
  const overall: 'ok' | 'degraded' | 'down' =
    brokenCritical.length > 0 ? 'down' : checks.some((c) => c.status === 'error') ? 'degraded' : 'ok'

  return NextResponse.json({
    overall,
    services: checks,
    timestamp: new Date().toISOString(),
  })
}
