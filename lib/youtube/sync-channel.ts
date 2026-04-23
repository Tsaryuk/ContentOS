/**
 * Pulls the full uploads playlist for a channel, upserts rows into yt_videos,
 * deletes rows that no longer exist on YouTube, and backfills content_type on
 * freshly-inserted rows.
 *
 * Used by POST /api/youtube/sync (manual, one channel) and by the daily
 * videos_sync_all cron in worker.ts (all channels with a refresh_token).
 */

import { supabaseAdmin } from '@/lib/supabase'
import { fetchChannelVideos } from './videos'

const BATCH_SIZE = 50

export interface SyncChannelResult {
  channelId: string
  title: string
  total: number
  synced: number
  errors: number
  removed: number
}

interface ChannelRow {
  id: string
  yt_channel_id: string
  title: string | null
}

export async function syncChannel(channel: ChannelRow): Promise<SyncChannelResult> {
  const ytVideos = await fetchChannelVideos(channel.yt_channel_id)

  // We deliberately do NOT include content_type here, so manual UI overrides
  // (saved in DB) survive re-sync. content_type is backfilled after the upsert
  // only for rows where it's NULL (new videos).
  const rows = ytVideos.map(v => ({
    channel_id:          channel.id,
    yt_video_id:         v.id,
    current_title:       v.title,
    current_description: v.description,
    current_tags:        v.tags,
    current_thumbnail:   v.thumbnail,
    duration_seconds:    v.duration_seconds,
    published_at:        v.published_at,
    view_count:          v.view_count,
    like_count:          v.like_count,
    privacy_status:      v.privacy_status,
  }))

  let synced = 0
  let errors = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await supabaseAdmin
      .from('yt_videos')
      .upsert(batch, { onConflict: 'yt_video_id', ignoreDuplicates: false })

    if (error) {
      errors += batch.length
      console.error('[sync-channel] batch upsert error:', error.message)
    } else {
      synced += batch.length
    }
  }

  // Remove videos deleted from YouTube
  let removed = 0
  const ytVideoIds = new Set(ytVideos.map(v => v.id))
  const { data: dbVideos } = await supabaseAdmin
    .from('yt_videos')
    .select('id, yt_video_id')
    .eq('channel_id', channel.id)

  if (dbVideos) {
    const toDelete = dbVideos.filter(v => !ytVideoIds.has(v.yt_video_id))
    if (toDelete.length > 0) {
      const ids = toDelete.map(v => v.id)
      await supabaseAdmin.from('yt_jobs').delete().in('video_id', ids)
      await supabaseAdmin.from('yt_changes').delete().in('video_id', ids)
      await supabaseAdmin.from('yt_social_drafts').delete().in('video_id', ids)
      await supabaseAdmin.from('tg_posts').update({ video_id: null }).in('video_id', ids)
      // Detach shorts/clips that reference any of these as parent — NO ACTION FK.
      await supabaseAdmin.from('yt_videos').update({ parent_video_id: null }).in('parent_video_id', ids)
      await supabaseAdmin.from('yt_videos').delete().in('id', ids)
      removed = toDelete.length
      console.log(`[sync-channel] Removed ${removed} deleted videos from ${channel.title ?? channel.yt_channel_id}`)
    }
  }

  // Backfill content_type for freshly-inserted rows that lack one.
  // Manual overrides are preserved because we target only NULL.
  // ≤60s → short, ≤3000s (50 min) → video, else podcast.
  const { data: missingType } = await supabaseAdmin
    .from('yt_videos')
    .select('id, duration_seconds')
    .eq('channel_id', channel.id)
    .is('content_type', null)

  if (missingType && missingType.length > 0) {
    const buckets: Record<'short' | 'video' | 'podcast', string[]> = { short: [], video: [], podcast: [] }
    for (const v of missingType) {
      const d = v.duration_seconds ?? 0
      const t = d > 0 && d <= 60 ? 'short' : d > 0 && d <= 3000 ? 'video' : 'podcast'
      buckets[t].push(v.id)
    }
    for (const t of ['short', 'video', 'podcast'] as const) {
      if (buckets[t].length === 0) continue
      await supabaseAdmin.from('yt_videos').update({ content_type: t }).in('id', buckets[t])
    }
  }

  return {
    channelId: channel.id,
    title: channel.title ?? channel.yt_channel_id,
    total: ytVideos.length,
    synced,
    errors,
    removed,
  }
}

export async function syncAllChannels(): Promise<{ total: number; ok: number; failed: number; removed: number }> {
  const { data: channels } = await supabaseAdmin
    .from('yt_channels')
    .select('id, yt_channel_id, title')
    .not('refresh_token', 'is', null)

  let ok = 0
  let failed = 0
  let removed = 0
  for (const ch of channels ?? []) {
    try {
      const r = await syncChannel(ch)
      ok += 1
      removed += r.removed
    } catch (err) {
      failed += 1
      console.error(`[sync-channel] ${ch.title ?? ch.yt_channel_id} failed:`, err instanceof Error ? err.message : err)
    }
  }
  console.log(`[sync-channel] syncAll done — ok=${ok} failed=${failed} removed=${removed}`)
  return { total: channels?.length ?? 0, ok, failed, removed }
}
