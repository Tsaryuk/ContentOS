import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createWriteStream, createReadStream } from 'fs'
import { unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { pipeline } from 'stream/promises'
import { Readable } from 'stream'
import { updateVideoStatus, logJob, getVideoWithChannel } from '@/lib/process/helpers'

export const maxDuration = 300

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
}

async function downloadAudio(ytVideoId: string): Promise<string> {
  const tmpPath = join(tmpdir(), `${ytVideoId}.webm`)

  // Use ytdl-core to get direct audio URL
  const ytdl = (await import('@distube/ytdl-core')).default
  const info = await ytdl.getInfo(`https://www.youtube.com/watch?v=${ytVideoId}`)
  const format = ytdl.chooseFormat(info.formats, { quality: 'lowestaudio' })

  if (!format || !format.url) {
    throw new Error('No audio format available')
  }

  const res = await fetch(format.url)
  if (!res.ok || !res.body) throw new Error(`Audio download failed: ${res.status}`)

  const writeStream = createWriteStream(tmpPath)
  await pipeline(Readable.fromWeb(res.body as any), writeStream)

  return tmpPath
}

export async function POST(req: NextRequest) {
  let tmpPath: string | null = null

  try {
    const { videoId } = await req.json()
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
    const jobId = await logJob({ videoId, jobType: 'transcribe', status: 'running' })

    // Download audio
    tmpPath = await downloadAudio(video.yt_video_id)

    // Whisper API
    const transcription = await getOpenAI().audio.transcriptions.create({
      file: createReadStream(tmpPath),
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
      language: 'ru',
    })

    // Parse transcript and chunks
    const transcript = transcription.text
    const chunks = (transcription as any).segments?.map((seg: any) => ({
      start: Math.round(seg.start),
      end: Math.round(seg.end),
      text: seg.text.trim(),
    })) ?? []

    // Save to DB
    const { supabaseAdmin } = await import('@/lib/supabase')
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
    if (req.body) {
      try {
        const { videoId } = await req.clone().json()
        if (videoId) {
          await updateVideoStatus(videoId, 'error', err.message)
          await logJob({ videoId, jobType: 'transcribe', status: 'failed', error: err.message })
        }
      } catch {}
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  } finally {
    if (tmpPath) {
      try { await unlink(tmpPath) } catch {}
    }
  }
}
