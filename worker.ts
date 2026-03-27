/**
 * ContentOS Worker Process
 * Runs separately from Next.js — handles all heavy processing via BullMQ queue.
 * Start with: npx tsx worker.ts
 */

import { Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { writeFile, unlink, mkdir, rm } from 'fs/promises'
import { createReadStream, existsSync, statSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'

// --- Config ---

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'
const PROXY_URL = 'http://fpxbkrxg-1:lw68k05vkwvh@p.webshare.io:80'
const CHUNK_MINUTES = 20
const MAX_FILE_SIZE = 24 * 1024 * 1024
const TMP_DIR = '/tmp/contentos-audio'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Retry wrapper for Claude API (handles 529 overloaded errors)
async function claudeWithRetry(
  params: Parameters<typeof anthropic.messages.create>[0],
  maxRetries = 3,
): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await anthropic.messages.create(params)
    } catch (err: any) {
      const status = err?.status ?? err?.error?.status
      if ((status === 529 || err?.message?.includes('Overloaded')) && attempt < maxRetries) {
        const delay = attempt * 30000 // 30s, 60s, 90s
        console.log(`[claude] 529 Overloaded, retry ${attempt}/${maxRetries} in ${delay / 1000}s...`)
        await new Promise(r => setTimeout(r, delay))
        continue
      }
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
}

async function updateProgress(videoId: string, message: string) {
  await supabase.from('yt_videos').update({
    error_message: `progress:${message}`,
    updated_at: new Date().toISOString(),
  }).eq('id', videoId)
  console.log(`[progress] ${message}`)
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

async function getChannel(channelId: string) {
  const { data, error } = await supabase.from('yt_channels').select('*').eq('id', channelId).single()
  if (error || !data) throw new Error(`Channel not found: ${channelId}`)
  return data
}

// --- Transcribe ---

async function ensureTmpDir() {
  if (!existsSync(TMP_DIR)) await mkdir(TMP_DIR, { recursive: true })
}

async function downloadAudio(ytVideoId: string): Promise<string> {
  const outPath = join(TMP_DIR, `${ytVideoId}.mp3`)
  const url = `https://www.youtube.com/watch?v=${ytVideoId}`
  const cmd = `yt-dlp --proxy "${PROXY_URL}" -x --audio-format mp3 --postprocessor-args "ffmpeg:-ac 1 -ab 48k" -o "${outPath}" "${url}"`
  console.log(`[download] yt-dlp via residential proxy for ${ytVideoId}`)
  execSync(cmd, { timeout: 600000, stdio: 'pipe' })
  if (!existsSync(outPath)) throw new Error(`Audio file not created: ${outPath}`)
  console.log(`[download] OK: ${(statSync(outPath).size / 1024 / 1024).toFixed(1)}MB`)
  return outPath
}

function splitAudio(audioPath: string, ytVideoId: string): string[] {
  if (statSync(audioPath).size <= MAX_FILE_SIZE) return [audioPath]
  const chunkDir = join(TMP_DIR, `${ytVideoId}-chunks`)
  if (!existsSync(chunkDir)) execSync(`mkdir -p "${chunkDir}"`)
  execSync(
    `ffmpeg -i "${audioPath}" -f segment -segment_time ${CHUNK_MINUTES * 60} -ac 1 -ab 48k -y "${chunkDir}/chunk_%03d.mp3"`,
    { timeout: 120000, stdio: 'pipe' },
  )
  return execSync(`ls -1 "${chunkDir}"/chunk_*.mp3`).toString().trim().split('\n').filter(Boolean).sort()
}

async function transcribeChunk(chunkPath: string, offset: number) {
  const res = await openai.audio.transcriptions.create({
    file: createReadStream(chunkPath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['segment'],
    language: 'ru',
  })
  return ((res as any).segments ?? [])
    .map((s: any) => ({ start: Math.round(s.start + offset), end: Math.round(s.end + offset), text: s.text.trim() }))
    .filter((s: any) => s.text.length > 0)
}

async function proofread(segments: { start: number; end: number; text: string }[], title: string) {
  const BATCH = 50
  const result: typeof segments = []

  for (let i = 0; i < segments.length; i += BATCH) {
    const batch = segments.slice(i, i + BATCH)
    const numbered = batch.map((s, idx) => `${idx}|${s.text}`).join('\n')

    const msg = await claudeWithRetry({
      model: 'claude-sonnet-4-20250514',
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
    })

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
  await updateStatus(videoId, 'transcribing')
  await logJob(videoId, 'transcribe', 'running')

  try {
    await ensureTmpDir()
    await updateProgress(videoId, 'Скачивание аудио...')
    const audioPath = await downloadAudio(video.yt_video_id)
    const chunks = splitAudio(audioPath, video.yt_video_id)

    const allSegs: { start: number; end: number; text: string }[] = []
    for (let i = 0; i < chunks.length; i++) {
      await updateProgress(videoId, `Расшифровка${chunks.length > 1 ? ` (${i + 1} из ${chunks.length})` : ''}...`)
      allSegs.push(...await transcribeChunk(chunks[i], i * CHUNK_MINUTES * 60))
    }
    if (allSegs.length === 0) throw new Error('Whisper returned empty transcript')

    await updateProgress(videoId, 'Проверка и исправление транскрипта...')
    const corrected = await proofread(allSegs, video.current_title)
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

  try {
    const durationMin = Math.round(video.duration_seconds / 60)
    const transcript = video.transcript.length > 100000
      ? video.transcript.slice(0, 100000) + '\n\n[...обрезано...]'
      : video.transcript

    const msg = await claudeWithRetry({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: buildSystemPrompt(rules),
      messages: [{
        role: 'user',
        content: `## Видео\n**Заголовок:** ${video.current_title}\n**Длительность:** ${durationMin} мин\n**Описание:** ${video.current_description || '(пусто)'}\n\n## Транскрипт\n${transcript}\n\n---\nСгенерируй JSON.`,
      }],
    })

    const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in Claude response')
    const result = JSON.parse(jsonMatch[0])
    if (!result.title || !result.description) throw new Error('Missing required fields')

    await supabase.from('yt_videos').update({
      generated_title: result.title,
      generated_description: result.description,
      generated_tags: result.tags ?? [],
      generated_timecodes: result.timecodes ?? [],
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

async function getYouTubeToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`YouTube OAuth failed: ${JSON.stringify(data)}`)
  return data.access_token
}

async function handlePublish(videoId: string) {
  const video = await getVideo(videoId)
  if (!video.is_approved) throw new Error('Not approved')
  if (!video.generated_title) throw new Error('No generated content')

  await updateStatus(videoId, 'publishing')
  await logJob(videoId, 'publish', 'running')

  try {
    const token = await getYouTubeToken()
    const getRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${video.yt_video_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const getData = await getRes.json()
    const snippet = getData.items?.[0]?.snippet
    if (!snippet) throw new Error('Video not found on YouTube')

    const putRes = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: video.yt_video_id,
        snippet: {
          title: video.generated_title,
          description: video.generated_description,
          tags: video.generated_tags ?? snippet.tags,
          categoryId: snippet.categoryId,
        },
      }),
    })
    if (!putRes.ok) throw new Error(`YouTube update: ${putRes.status} ${await putRes.text()}`)

    await logChange(videoId, 'title', video.current_title, video.generated_title)
    await logChange(videoId, 'description', video.current_description, video.generated_description)

    await supabase.from('yt_videos').update({ is_published_back: true, updated_at: new Date().toISOString() }).eq('id', videoId)

    await updateStatus(videoId, 'done')
    await logJob(videoId, 'publish', 'done', { title: video.generated_title })
    console.log(`[publish] OK: ${video.generated_title}`)
  } catch (err: any) {
    console.error(`[publish] FAIL:`, err.message)
    await updateStatus(videoId, 'error', err.message)
    await logJob(videoId, 'publish', 'failed', undefined, err.message)
  }
}

// --- Produce (Master Producer Agent) ---

import { buildProducerSystemPrompt, buildProducerUserPrompt } from './lib/process/prompts'
import { generateThumbnail, pickColor } from './lib/process/thumbnail-generator'

async function generateThumbnails(
  videoId: string,
  spec: any,
  video: any,
): Promise<string[]> {
  const urls: string[] = []
  const textVariants = spec.text_overlay_variants ?? ['']
  const guestName = video.producer_output?.guest_info?.name ?? spec.guest_name ?? ''
  const duration = video.duration_seconds
    ? `${Math.floor(video.duration_seconds / 3600)}:${String(Math.floor((video.duration_seconds % 3600) / 60)).padStart(2, '0')}:${String(video.duration_seconds % 60).padStart(2, '0')}`
    : ''

  for (let i = 0; i < Math.min(textVariants.length, 3); i++) {
    try {
      const thumbnailBuf = await generateThumbnail({
        title: textVariants[i] || video.current_title,
        guestName,
        duration,
        bgColor: pickColor(i),
        guestPhotoUrl: video.current_thumbnail, // use YouTube thumbnail as guest photo
        accentColor: i === 0 ? '#FFD700' : i === 1 ? '#00BFFF' : '#FF6B6B',
      })

      const fileName = `${videoId}_${i}.jpg`
      await supabase.storage.from('thumbnails').upload(fileName, thumbnailBuf, {
        contentType: 'image/jpeg', upsert: true,
      })
      const { data: pub } = supabase.storage.from('thumbnails').getPublicUrl(fileName)
      urls.push(pub.publicUrl)

      console.log(`[produce] Thumbnail ${i}: ${pub.publicUrl}`)
    } catch (err: any) {
      console.error(`[produce] Thumbnail ${i} error:`, err.message)
    }
  }

  return urls
}

async function handleProduce(videoId: string) {
  const video = await getVideo(videoId)
  const channel = await getChannel(video.channel_id)
  const rules = channel.rules

  await updateStatus(videoId, 'producing')
  await logJob(videoId, 'produce', 'running')

  try {
    // Step 1: Transcribe if needed
    if (!video.transcript) {
      await updateProgress(videoId, 'Транскрипт не найден, запускаем расшифровку...')
      console.log('[produce] No transcript, transcribing first...')
      await handleTranscribe(videoId)
      // Re-fetch video after transcription
      const updated = await getVideo(videoId)
      if (!updated.transcript) throw new Error('Transcription failed')
      Object.assign(video, updated)
    }

    // Step 2: Claude Producer Agent
    await updateProgress(videoId, 'AI анализ контента и генерация метаданных...')
    console.log('[produce] Calling Claude Producer Agent...')
    const durationMin = Math.round(video.duration_seconds / 60)

    const msg = await claudeWithRetry({
      model: 'claude-sonnet-4-20250514',
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
    })

    const text = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in producer response')

    const output = JSON.parse(jsonMatch[0])

    // Validate required fields
    if (!output.title_variants?.length || !output.description) {
      throw new Error('Missing required fields in producer output')
    }

    console.log(`[produce] Got ${output.title_variants.length} titles, ${output.clip_suggestions?.length ?? 0} clips, ${output.short_suggestions?.length ?? 0} shorts`)

    // Thumbnails: NOT auto-generated. User creates via Thumbnail Studio (fal.ai)
    // Producer only saves thumbnail_spec (prompt + text variants)

    // Step 3: Save producer output (DO NOT overwrite generated_title until user approves)
    await supabase.from('yt_videos').update({
      producer_output: output,
      selected_variants: { title_index: null, thumbnail_text_index: null, clips_selected: [], shorts_selected: [] },
      ai_score: output.ai_score,
      updated_at: new Date().toISOString(),
    }).eq('id', videoId)

    // Step 5: Save social drafts
    if (output.social_drafts?.length) {
      for (const draft of output.social_drafts) {
        await supabase.from('yt_social_drafts').upsert({
          video_id: videoId,
          platform: draft.platform,
          content: draft.content,
          status: 'draft',
        }, { onConflict: 'video_id,platform' }).select()
        // If upsert fails due to no unique constraint, just insert
      }
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
  }
}

// --- Worker ---

const handlers: Record<string, (videoId: string) => Promise<void>> = {
  transcribe: handleTranscribe,
  generate: handleGenerate,
  thumbnail: handleThumbnail,
  publish: handlePublish,
  produce: handleProduce,
}

const worker = new Worker(
  'contentos',
  async (job: Job) => {
    const handler = handlers[job.name]
    if (!handler) throw new Error(`Unknown job: ${job.name}`)
    console.log(`[worker] Processing ${job.name} for ${job.data.videoId}`)
    await handler(job.data.videoId)
  },
  {
    connection: redis,
    concurrency: 1,
    lockDuration: 600000,       // 10 min lock (long transcriptions)
    lockRenewTime: 30000,       // renew every 30s
    limiter: { max: 1, duration: 1000 },
  },
)

worker.on('failed', (job, err) => {
  console.error(`[worker] Job ${job?.name} failed:`, err.message)
})

worker.on('completed', (job) => {
  console.log(`[worker] Job ${job.name} completed`)
})

console.log('[worker] ContentOS worker started. Waiting for jobs...')
