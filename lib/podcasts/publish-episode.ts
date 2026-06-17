// Podcast episode publishing — turns a finished YouTube podcast video into a
// podcast_episodes row that the RSS feed (and therefore Mave) can serve.
//
// Flow per episode:
//   1. Load the yt_videos row (must be content_type='podcast', status='done').
//   2. Find the channel's podcast_shows row.
//   3. Skip if an episode already exists for this video (unique idempotency).
//   4. Extract a 64 kbps mono mp3 from the source video via yt-dlp.
//   5. Upload it to the public `podcast-audio` Storage bucket.
//   6. Insert the podcast_episodes row with the public audio URL.
//
// WORKER-ONLY: this module shells out to yt-dlp/ffmpeg and must never be
// imported by the Next.js app bundle. The worker imports it dynamically; API
// routes enqueue the `podcast_publish` job instead of importing this directly.

import { execFileSync } from 'child_process'
import { existsSync, readFileSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { supabaseAdmin } from '@/lib/supabase'

const AUDIO_BUCKET = 'podcast-audio'
const PROXY_URL = process.env.PROXY_URL

export interface PublishEpisodeResult {
  status: 'published' | 'skipped'
  reason?: string
  episodeId?: string
}

function assertYtVideoId(id: string): void {
  if (!/^[A-Za-z0-9_-]{6,20}$/.test(id)) {
    throw new Error(`Invalid yt_video_id: ${id}`)
  }
}

/**
 * Publish a single finished podcast video as a podcast episode. Idempotent:
 * a second call for the same video returns `skipped` (the unique index on
 * podcast_episodes.video_id is the source of truth).
 */
export async function publishEpisode(videoId: string): Promise<PublishEpisodeResult> {
  const { data: video, error: videoErr } = await supabaseAdmin
    .from('yt_videos')
    .select('*')
    .eq('id', videoId)
    .single()
  if (videoErr || !video) throw new Error(`podcast publish: video ${videoId} not found`)
  if (video.content_type !== 'podcast') return { status: 'skipped', reason: 'not_podcast' }
  if (video.status !== 'done') return { status: 'skipped', reason: `status_${video.status}` }

  const { data: show } = await supabaseAdmin
    .from('podcast_shows')
    .select('id, slug, is_active')
    .eq('channel_id', video.channel_id)
    .maybeSingle()
  if (!show) return { status: 'skipped', reason: 'no_show' }
  if (!show.is_active) return { status: 'skipped', reason: 'show_inactive' }

  const { data: existing } = await supabaseAdmin
    .from('podcast_episodes')
    .select('id')
    .eq('video_id', video.id)
    .maybeSingle()
  if (existing) return { status: 'skipped', reason: 'already_published', episodeId: existing.id }

  assertYtVideoId(video.yt_video_id)
  const outPath = join(tmpdir(), `pod-${video.yt_video_id}.mp3`)
  const url = `https://www.youtube.com/watch?v=${video.yt_video_id}`

  try {
    execFileSync(
      'yt-dlp',
      [
        ...(PROXY_URL ? ['--proxy', PROXY_URL] : []),
        '-x',
        '--audio-format',
        'mp3',
        '--postprocessor-args',
        'ffmpeg:-ac 1 -ab 64k',
        '-o',
        outPath,
        url,
      ],
      { timeout: 600000, stdio: 'pipe' },
    )
    if (!existsSync(outPath)) throw new Error('audio file not created by yt-dlp')

    const buffer = readFileSync(outPath)
    const audioSize = statSync(outPath).size
    const storagePath = `${show.slug}/${video.yt_video_id}.mp3`

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(AUDIO_BUCKET)
      .upload(storagePath, buffer, { contentType: 'audio/mpeg', upsert: true })
    if (uploadErr) throw uploadErr

    const {
      data: { publicUrl },
    } = supabaseAdmin.storage.from(AUDIO_BUCKET).getPublicUrl(storagePath)

    // Next episode number for this show (nulls treated as 0).
    const { data: last } = await supabaseAdmin
      .from('podcast_episodes')
      .select('episode_number')
      .eq('show_id', show.id)
      .order('episode_number', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    const episodeNumber = (last?.episode_number ?? 0) + 1

    const title = (video.generated_title || video.current_title || 'Без названия').slice(0, 300)
    const description = video.generated_description || video.current_description || null

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('podcast_episodes')
      .insert({
        show_id: show.id,
        video_id: video.id,
        episode_number: episodeNumber,
        title,
        description,
        guest_name: video.guest_name ?? null,
        audio_url: publicUrl,
        audio_size: audioSize,
        audio_mime: 'audio/mpeg',
        duration_sec: video.duration_seconds ?? null,
        status: 'published',
      })
      .select('id')
      .single()
    if (insertErr) throw insertErr

    console.log(
      `[podcast] published ep ${episodeNumber} "${title}" (${(audioSize / 1024 / 1024).toFixed(1)}MB) → ${show.slug}`,
    )
    return { status: 'published', episodeId: inserted.id }
  } finally {
    try {
      if (existsSync(outPath)) rmSync(outPath)
    } catch {
      // best-effort temp cleanup
    }
  }
}
