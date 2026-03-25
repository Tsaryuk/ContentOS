import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { updateVideoStatus, logJob, getVideoWithChannel } from '@/lib/process/helpers'

export const maxDuration = 60

interface CaptionChunk {
  start: number
  end: number
  text: string
}

async function fetchTranscript(ytVideoId: string): Promise<{
  transcript: string
  chunks: CaptionChunk[]
}> {
  // Step 1: Get the video page to find available caption tracks
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${ytVideoId}`, {
    headers: { 'Accept-Language': 'ru,en;q=0.9' },
  })
  const pageHtml = await pageRes.text()

  // Extract captions JSON from the page
  const captionsMatch = pageHtml.match(/"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"videoDetails"/)
    || pageHtml.match(/"captionTracks":\s*(\[.*?\])/)

  if (!captionsMatch) {
    // Try direct timedtext URL as fallback
    return await tryTimedText(ytVideoId, 'ru')
  }

  // Find caption track URLs from the page data
  let trackUrl: string | null = null

  try {
    // Try to find captionTracks array
    const tracksMatch = pageHtml.match(/"captionTracks":\s*(\[.*?\])/)
    if (tracksMatch) {
      const tracks = JSON.parse(tracksMatch[1])
      // Prefer Russian manual, then Russian auto, then any
      const ruManual = tracks.find((t: any) => t.languageCode === 'ru' && t.kind !== 'asr')
      const ruAuto = tracks.find((t: any) => t.languageCode === 'ru')
      const any = tracks[0]
      const picked = ruManual || ruAuto || any
      if (picked?.baseUrl) {
        trackUrl = picked.baseUrl
      }
    }
  } catch {}

  if (trackUrl) {
    // Fetch the caption track as json3
    const url = trackUrl.includes('fmt=') ? trackUrl : trackUrl + '&fmt=json3'
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      return parseJson3(data)
    }
  }

  // Fallback to direct timedtext
  return await tryTimedText(ytVideoId, 'ru')
}

async function tryTimedText(ytVideoId: string, lang: string): Promise<{
  transcript: string
  chunks: CaptionChunk[]
}> {
  // Try multiple timedtext approaches
  const attempts = [
    `https://www.youtube.com/api/timedtext?v=${ytVideoId}&lang=${lang}&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${ytVideoId}&lang=${lang}&kind=asr&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${ytVideoId}&lang=en&fmt=json3`,
    `https://www.youtube.com/api/timedtext?v=${ytVideoId}&lang=${lang}&fmt=srv3`,
    `https://www.youtube.com/api/timedtext?v=${ytVideoId}&lang=${lang}&kind=asr&fmt=srv3`,
  ]

  for (const url of attempts) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue

      const contentType = res.headers.get('content-type') || ''
      const body = await res.text()
      if (!body || body.length < 20) continue

      if (contentType.includes('json') || body.trimStart().startsWith('{')) {
        return parseJson3(JSON.parse(body))
      } else if (body.includes('<')) {
        return parseXml(body)
      }
    } catch {
      continue
    }
  }

  throw new Error('No captions available for this video. Tried all methods (json3, srv3, ru, en, asr).')
}

function parseJson3(data: any): { transcript: string; chunks: CaptionChunk[] } {
  const events = data.events ?? []
  const chunks: CaptionChunk[] = []

  for (const event of events) {
    if (!event.segs) continue
    const text = event.segs.map((s: any) => s.utf8 ?? '').join('').trim()
    if (!text || text === '\n') continue

    const startMs = event.tStartMs ?? 0
    const durMs = event.dDurationMs ?? 3000

    chunks.push({
      start: Math.round(startMs / 1000),
      end: Math.round((startMs + durMs) / 1000),
      text,
    })
  }

  if (chunks.length === 0) throw new Error('Parsed json3 but got 0 chunks')

  const transcript = chunks.map(c => c.text).join(' ')
  return { transcript, chunks }
}

function parseXml(xml: string): { transcript: string; chunks: CaptionChunk[] } {
  const chunks: CaptionChunk[] = []

  // <text start="1.23" dur="4.56">caption text</text>
  const matches = xml.matchAll(/<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g)
  for (const m of matches) {
    const start = parseFloat(m[1])
    const dur = parseFloat(m[2] || '3')
    const text = decodeEntities(m[3].replace(/<[^>]+>/g, '').trim())
    if (text) {
      chunks.push({ start: Math.round(start), end: Math.round(start + dur), text })
    }
  }

  // <p t="ms" d="ms">text</p>
  if (chunks.length === 0) {
    const pMatches = xml.matchAll(/<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g)
    for (const m of pMatches) {
      const startMs = parseInt(m[1])
      const durMs = parseInt(m[2])
      const text = decodeEntities(m[3].replace(/<[^>]+>/g, '').trim())
      if (text) {
        chunks.push({ start: Math.round(startMs / 1000), end: Math.round((startMs + durMs) / 1000), text })
      }
    }
  }

  if (chunks.length === 0) throw new Error('Parsed XML but got 0 chunks')

  const transcript = chunks.map(c => c.text).join(' ')
  return { transcript, chunks }
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
}

export async function POST(req: NextRequest) {
  let videoId: string | null = null

  try {
    const body = await req.json()
    videoId = body.videoId
    if (!videoId) {
      return NextResponse.json({ error: 'videoId required' }, { status: 400 })
    }

    const { video } = await getVideoWithChannel(videoId)

    if (video.status !== 'pending' && video.status !== 'error') {
      return NextResponse.json(
        { error: `Cannot transcribe video with status "${video.status}"` },
        { status: 400 }
      )
    }

    await updateVideoStatus(videoId, 'transcribing')
    await logJob({ videoId, jobType: 'transcribe', status: 'running' })

    // Fetch captions from YouTube (no auth needed)
    const { transcript, chunks } = await fetchTranscript(video.yt_video_id)

    if (!transcript || transcript.length < 10) {
      throw new Error('Transcript too short or empty')
    }

    // Save to DB
    const { error: updateErr } = await supabaseAdmin
      .from('yt_videos')
      .update({
        transcript,
        transcript_chunks: chunks,
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId)

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`)

    await updateVideoStatus(videoId, 'generating')
    await logJob({ videoId, jobType: 'transcribe', status: 'done', result: {
      transcript_length: transcript.length,
      chunks_count: chunks.length,
    }})

    return NextResponse.json({
      success: true,
      transcript_length: transcript.length,
      chunks_count: chunks.length,
    })

  } catch (err: any) {
    console.error('[transcribe]', err)
    if (videoId) {
      await updateVideoStatus(videoId, 'error', err.message).catch(() => {})
      await logJob({ videoId, jobType: 'transcribe', status: 'failed', error: err.message }).catch(() => {})
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
