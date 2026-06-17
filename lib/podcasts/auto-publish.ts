// Podcast auto-publish enqueueing — finds finished podcast videos that don't
// yet have an episode and enqueues a `podcast_publish` job per video.
//
// Kept separate from publish-episode.ts (which shells out to yt-dlp/ffmpeg) so
// this module stays free of child_process and can be imported by BOTH the
// worker cron AND Next.js API routes. The heavy extraction runs later, in the
// worker, when each enqueued job is processed.

import { supabaseAdmin } from '@/lib/supabase'
import { enqueueProcessJob } from '@/lib/process/enqueue'

export interface AutoPublishResult {
  enqueued: number
  skipped: number
}

async function enqueueReadyVideos(channelIds: string[]): Promise<AutoPublishResult> {
  if (channelIds.length === 0) return { enqueued: 0, skipped: 0 }

  const { data: videos } = await supabaseAdmin
    .from('yt_videos')
    .select('id')
    .in('channel_id', channelIds)
    .eq('content_type', 'podcast')
    .eq('status', 'done')
  if (!videos?.length) return { enqueued: 0, skipped: 0 }

  const videoIds = videos.map((v) => v.id)
  const { data: episodes } = await supabaseAdmin
    .from('podcast_episodes')
    .select('video_id')
    .in('video_id', videoIds)
  const alreadyPublished = new Set((episodes ?? []).map((e) => e.video_id))

  let enqueued = 0
  let skipped = 0
  for (const v of videos) {
    if (alreadyPublished.has(v.id)) {
      skipped++
      continue
    }
    await enqueueProcessJob('podcast_publish', v.id, { videoId: v.id }, { attempts: 1 })
    enqueued++
  }
  return { enqueued, skipped }
}

/**
 * Cron tick — publish ready videos for every show with auto_publish enabled.
 */
export async function runPodcastAutoPublish(): Promise<AutoPublishResult> {
  const { data: shows } = await supabaseAdmin
    .from('podcast_shows')
    .select('channel_id')
    .eq('auto_publish', true)
    .eq('is_active', true)
  const channelIds = (shows ?? []).map((s) => s.channel_id).filter(Boolean)
  return enqueueReadyVideos(channelIds)
}

/**
 * Manual trigger — publish ready videos for one show, regardless of its
 * auto_publish flag. Backs the "Опубликовать готовые" button in settings.
 */
export async function publishReadyForShow(showId: string): Promise<AutoPublishResult> {
  const { data: show } = await supabaseAdmin
    .from('podcast_shows')
    .select('channel_id')
    .eq('id', showId)
    .maybeSingle()
  if (!show?.channel_id) return { enqueued: 0, skipped: 0 }
  return enqueueReadyVideos([show.channel_id])
}
