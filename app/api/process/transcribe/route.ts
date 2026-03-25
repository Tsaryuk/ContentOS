import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'
import { createReadStream, existsSync, statSync, readdirSync, mkdirSync } from 'fs'
import { unlink, rm } from 'fs/promises'
import { join } from 'path'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { updateVideoStatus, logJob, getVideoWithChannel } from '@/lib/process/helpers'

export const maxDuration = 300

const CHUNK_MINUTES = 20
const MAX_FILE_SIZE = 24 * 1024 * 1024 // 24MB safety margin (Whisper limit 25MB)
const TMP_DIR = '/tmp/contentos-audio'

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
}

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

async function proofreadTranscript(
  segments: { start: number; end: number; text: string }[],
  videoTitle: string,
): Promise<{ start: number; end: number; text: string }[]> {
  const anthropic = getAnthropic()

  // Process in batches of ~50 segments to stay within token limits
  const BATCH_SIZE = 50
  const corrected: { start: number; end: number; text: string }[] = []

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE)

    const numbered = batch
      .map((seg, idx) => `${idx}|${seg.text}`)
      .join('\n')

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: `Ты — корректор транскриптов подкастов на русском языке.

Правила:
1. Исправь ошибки распознавания речи (неправильные слова, имена, термины)
2. Добавь пунктуацию (точки, запятые, вопросительные/восклицательные знаки)
3. Исправь регистр (начало предложений с заглавной)
4. НЕ меняй смысл, НЕ добавляй/удаляй слова, НЕ перефразируй
5. НЕ объединяй и НЕ разделяй строки — количество строк на входе и выходе ОДИНАКОВОЕ
6. Формат: номер|исправленный текст (один в один как на входе)

Контекст видео: "${videoTitle}"`,
      messages: [{
        role: 'user',
        content: `Исправь каждую строку. Верни ровно ${batch.length} строк в формате номер|текст:\n\n${numbered}`,
      }],
    })

    const responseText = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as any).text)
      .join('')

    const lines = responseText.trim().split('\n').filter(l => l.includes('|'))

    // Map corrections back to segments
    for (let j = 0; j < batch.length; j++) {
      const seg = batch[j]
      const correctedLine = lines.find(l => l.startsWith(`${j}|`))
      const correctedText = correctedLine
        ? correctedLine.substring(correctedLine.indexOf('|') + 1).trim()
        : seg.text

      corrected.push({
        start: seg.start,
        end: seg.end,
        text: correctedText || seg.text,
      })
    }
  }

  return corrected
}

function ensureTmpDir() {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true })
}

function downloadAudio(ytVideoId: string): string {
  const outPath = join(TMP_DIR, `${ytVideoId}.mp3`)
  // yt-dlp: extract audio, convert to mp3 mono 48kbps (small file size)
  execSync(
    `yt-dlp -x --audio-format mp3 --postprocessor-args "ffmpeg:-ac 1 -ab 48k" ` +
    `-o "${outPath}" "https://www.youtube.com/watch?v=${ytVideoId}"`,
    { timeout: 180000, stdio: 'pipe' }
  )
  if (!existsSync(outPath)) {
    throw new Error('yt-dlp failed to download audio')
  }
  return outPath
}

function splitAudio(audioPath: string, ytVideoId: string): string[] {
  const stat = statSync(audioPath)

  // If file is small enough, no need to split
  if (stat.size <= MAX_FILE_SIZE) {
    return [audioPath]
  }

  // Split into chunks
  const chunkDir = join(TMP_DIR, `${ytVideoId}-chunks`)
  if (!existsSync(chunkDir)) mkdirSync(chunkDir, { recursive: true })

  const chunkSeconds = CHUNK_MINUTES * 60
  execSync(
    `ffmpeg -i "${audioPath}" -f segment -segment_time ${chunkSeconds} ` +
    `-ac 1 -ab 48k -y "${chunkDir}/chunk_%03d.mp3"`,
    { timeout: 120000, stdio: 'pipe' }
  )

  const chunks = readdirSync(chunkDir)
    .filter(f => f.endsWith('.mp3'))
    .sort()
    .map(f => join(chunkDir, f))

  return chunks
}

async function transcribeChunk(
  openai: OpenAI,
  chunkPath: string,
  offsetSeconds: number,
): Promise<{ text: string; segments: { start: number; end: number; text: string }[] }> {
  const response = await openai.audio.transcriptions.create({
    file: createReadStream(chunkPath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
    language: 'ru',
  })

  const segments = ((response as any).segments ?? []).map((seg: any) => ({
    start: Math.round(seg.start + offsetSeconds),
    end: Math.round(seg.end + offsetSeconds),
    text: seg.text.trim(),
  })).filter((s: any) => s.text.length > 0)

  return { text: response.text, segments }
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

async function cleanup(ytVideoId: string) {
  const audioPath = join(TMP_DIR, `${ytVideoId}.mp3`)
  const chunkDir = join(TMP_DIR, `${ytVideoId}-chunks`)
  try { if (existsSync(audioPath)) await unlink(audioPath) } catch {}
  try { if (existsSync(chunkDir)) await rm(chunkDir, { recursive: true }) } catch {}
}

export async function POST(req: NextRequest) {
  let videoId: string | null = null
  let ytVideoId: string | null = null

  try {
    const body = await req.json()
    videoId = body.videoId
    if (!videoId) {
      return NextResponse.json({ error: 'videoId required' }, { status: 400 })
    }

    const { video } = await getVideoWithChannel(videoId)
    ytVideoId = video.yt_video_id

    if (video.status !== 'pending' && video.status !== 'error') {
      return NextResponse.json(
        { error: `Cannot transcribe video with status "${video.status}"` },
        { status: 400 }
      )
    }

    await updateVideoStatus(videoId, 'transcribing')
    await logJob({ videoId, jobType: 'transcribe', status: 'running' })

    ensureTmpDir()

    // Step 1: Download audio via yt-dlp
    const audioPath = downloadAudio(ytVideoId)

    // Step 2: Split if needed (>24MB)
    const chunks = splitAudio(audioPath, ytVideoId)

    // Step 3: Transcribe each chunk with Whisper
    const openai = getOpenAI()
    const allSegments: { start: number; end: number; text: string }[] = []
    const allTexts: string[] = []

    for (let i = 0; i < chunks.length; i++) {
      const offsetSeconds = i * CHUNK_MINUTES * 60
      const result = await transcribeChunk(openai, chunks[i], offsetSeconds)
      allTexts.push(result.text)
      allSegments.push(...result.segments)
    }

    // Step 4: Proofread with Claude (fix speech recognition errors, add punctuation)
    const proofread = await proofreadTranscript(allSegments, video.current_title)

    // Step 5: Build formatted transcript with timestamps
    const transcript = proofread
      .map(seg => `[${formatTimestamp(seg.start)}]\n${seg.text}`)
      .join('\n')

    const transcriptChunks = proofread.map(seg => ({
      start: seg.start,
      end: seg.end,
      text: seg.text,
    }))

    if (transcript.length < 10) {
      throw new Error('Transcript too short or empty')
    }

    // Step 5: Save to DB
    const { error: updateErr } = await supabaseAdmin
      .from('yt_videos')
      .update({
        transcript,
        transcript_chunks: transcriptChunks,
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId)

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`)

    await updateVideoStatus(videoId, 'generating')
    await logJob({ videoId, jobType: 'transcribe', status: 'done', result: {
      transcript_length: transcript.length,
      chunks_count: transcriptChunks.length,
      audio_chunks: chunks.length,
    }})

    return NextResponse.json({
      success: true,
      transcript_length: transcript.length,
      chunks_count: transcriptChunks.length,
      audio_chunks: chunks.length,
    })

  } catch (err: any) {
    console.error('[transcribe]', err)
    if (videoId) {
      await updateVideoStatus(videoId, 'error', err.message).catch(() => {})
      await logJob({ videoId, jobType: 'transcribe', status: 'failed', error: err.message }).catch(() => {})
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  } finally {
    if (ytVideoId) await cleanup(ytVideoId)
  }
}
