import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getYouTubeToken } from '@/lib/youtube/auth'
import { updateVideoStatus, logJob, getVideoWithChannel } from '@/lib/process/helpers'

export const maxDuration = 60

interface CaptionTrack {
  id: string
  snippet: {
    language: string
    trackKind: string
    name: string
  }
}

async function fetchCaptions(ytVideoId: string, token: string): Promise<{
  transcript: string
  chunks: { start: number; end: number; text: string }[]
}> {
  // 1. List available caption tracks
  const listRes = await fetch(
    `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${ytVideoId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!listRes.ok) {
    throw new Error(`Captions list failed: ${listRes.status} ${await listRes.text()}`)
  }

  const listData = await listRes.json()
  const tracks: CaptionTrack[] = listData.items ?? []

  if (tracks.length === 0) {
    throw new Error('No captions available for this video')
  }

  // 2. Pick best track: prefer manual Russian, then auto Russian, then any
  const preferred =
    tracks.find(t => t.snippet.language === 'ru' && t.snippet.trackKind !== 'ASR') ??
    tracks.find(t => t.snippet.language === 'ru') ??
    tracks.find(t => t.snippet.trackKind !== 'ASR') ??
    tracks[0]

  // 3. Download caption track as SRT
  const downloadRes = await fetch(
    `https://www.googleapis.com/youtube/v3/captions/${preferred.id}?tfmt=srt`,
    { headers: { Authorization: `Bearer ${token}` } }
  )

  if (!downloadRes.ok) {
    // Captions download API requires channel ownership or special permission
    // Fallback: try timedtext API (public, works for auto-captions)
    return await fetchTimedText(ytVideoId, preferred.snippet.language)
  }

  const srtText = await downloadRes.text()
  return parseSrt(srtText)
}

async function fetchTimedText(ytVideoId: string, lang: string): Promise<{
  transcript: string
  chunks: { start: number; end: number; text: string }[]
}> {
  // Public timedtext endpoint — works for auto-generated and public captions
  const url = `https://www.youtube.com/api/timedtext?v=${ytVideoId}&lang=${lang}&fmt=json3`
  const res = await fetch(url)

  if (!res.ok) {
    // Try without lang to get default
    const fallbackRes = await fetch(
      `https://www.youtube.com/api/timedtext?v=${ytVideoId}&lang=ru&fmt=json3`
    )
    if (!fallbackRes.ok) {
      // Last resort: try srv3 XML format with auto-generated captions
      return await fetchTimedTextXml(ytVideoId, lang)
    }
    const data = await fallbackRes.json()
    return parseJson3(data)
  }

  const data = await res.json()
  return parseJson3(data)
}

async function fetchTimedTextXml(ytVideoId: string, lang: string): Promise<{
  transcript: string
  chunks: { start: number; end: number; text: string }[]
}> {
  // srv3 XML format — most reliable for auto-captions
  const url = `https://www.youtube.com/api/timedtext?v=${ytVideoId}&lang=${lang}&fmt=srv3`
  const res = await fetch(url)

  if (!res.ok) {
    // Try with asr_langs parameter for auto-generated
    const aRes = await fetch(
      `https://www.youtube.com/api/timedtext?v=${ytVideoId}&lang=${lang}&kind=asr&fmt=srv3`
    )
    if (!aRes.ok) {
      throw new Error(`No captions available (tried all methods). Status: ${aRes.status}`)
    }
    return parseXmlCaptions(await aRes.text())
  }

  return parseXmlCaptions(await res.text())
}

function parseXmlCaptions(xml: string): {
  transcript: string
  chunks: { start: number; end: number; text: string }[]
} {
  const chunks: { start: number; end: number; text: string }[] = []

  // Parse <p t="ms" d="ms">text</p> or <text start="s" dur="s">text</text>
  const pMatches = xml.matchAll(/<p\s+t="(\d+)"\s+d="(\d+)"[^>]*>([\s\S]*?)<\/p>/g)
  for (const match of pMatches) {
    const startMs = parseInt(match[1])
    const durMs = parseInt(match[2])
    const text = decodeXmlEntities(match[3].replace(/<[^>]+>/g, '').trim())
    if (text) {
      chunks.push({
        start: Math.round(startMs / 1000),
        end: Math.round((startMs + durMs) / 1000),
        text,
      })
    }
  }

  // Fallback: <text start="s" dur="s">
  if (chunks.length === 0) {
    const textMatches = xml.matchAll(/<text\s+start="([\d.]+)"\s+dur="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g)
    for (const match of textMatches) {
      const start = parseFloat(match[1])
      const dur = parseFloat(match[2])
      const text = decodeXmlEntities(match[3].replace(/<[^>]+>/g, '').trim())
      if (text) {
        chunks.push({
          start: Math.round(start),
          end: Math.round(start + dur),
          text,
        })
      }
    }
  }

  if (chunks.length === 0) {
    throw new Error('Failed to parse captions XML')
  }

  const transcript = chunks.map(c => c.text).join(' ')
  return { transcript, chunks }
}

function parseJson3(data: any): {
  transcript: string
  chunks: { start: number; end: number; text: string }[]
} {
  const events = data.events ?? []
  const chunks: { start: number; end: number; text: string }[] = []

  for (const event of events) {
    if (!event.segs) continue
    const text = event.segs.map((s: any) => s.utf8).join('').trim()
    if (!text || text === '\n') continue

    const startMs = event.tStartMs ?? 0
    const durMs = event.dDurationMs ?? 0

    chunks.push({
      start: Math.round(startMs / 1000),
      end: Math.round((startMs + durMs) / 1000),
      text,
    })
  }

  const transcript = chunks.map(c => c.text).join(' ')
  return { transcript, chunks }
}

function parseSrt(srt: string): {
  transcript: string
  chunks: { start: number; end: number; text: string }[]
} {
  const chunks: { start: number; end: number; text: string }[] = []
  const blocks = srt.trim().split(/\n\n+/)

  for (const block of blocks) {
    const lines = block.split('\n')
    if (lines.length < 3) continue

    const timeMatch = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    )
    if (!timeMatch) continue

    const start = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseInt(timeMatch[3])
    const end = parseInt(timeMatch[5]) * 3600 + parseInt(timeMatch[6]) * 60 + parseInt(timeMatch[7])
    const text = lines.slice(2).join(' ').replace(/<[^>]+>/g, '').trim()

    if (text) {
      chunks.push({ start, end, text })
    }
  }

  const transcript = chunks.map(c => c.text).join(' ')
  return { transcript, chunks }
}

function decodeXmlEntities(str: string): string {
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

    // Get YouTube token and fetch captions
    const token = await getYouTubeToken()
    const { transcript, chunks } = await fetchCaptions(video.yt_video_id, token)

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
