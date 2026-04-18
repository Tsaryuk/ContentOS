/**
 * Daily metric snapshot — writes one row to metric_snapshots per channel
 * and one for the Unisender newsletter list. Idempotent per (captured_at,
 * source, entity_id) via the UNIQUE index, so running it multiple times
 * a day is harmless.
 *
 * Runs from worker.ts on a cron (once per day at 00:15 UTC).
 */

import { supabaseAdmin } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { getContactCount } from '@/lib/unisender'

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function captureMetricSnapshots(): Promise<{ channels: number; newsletter: boolean }> {
  const captured_at = todayISODate()
  const log = logger.child({ module: 'metrics-snapshot', captured_at })

  // YouTube channels — one snapshot per channel using the latest values in
  // yt_channels (updated by /api/auth/callback + channel add). We also sum
  // yt_videos.view_count on the fly so the snapshot has a view total.
  const { data: channels, error: chErr } = await supabaseAdmin
    .from('yt_channels')
    .select('id, project_id, subscriber_count, video_count')

  if (chErr) {
    log.error({ err: chErr.message }, 'fetch channels failed')
    return { channels: 0, newsletter: false }
  }

  let channelsWritten = 0
  for (const ch of channels ?? []) {
    // Sum view/like counts in JS — Supabase doesn't expose SQL aggregates
    // through PostgREST reliably without an RPC, and channels have ≤1k videos.
    const { data: vids } = await supabaseAdmin
      .from('yt_videos')
      .select('view_count, like_count')
      .eq('channel_id', ch.id)

    let views = 0, likes = 0
    for (const v of vids ?? []) {
      views += Number(v.view_count ?? 0)
      likes += Number(v.like_count ?? 0)
    }

    const { error } = await supabaseAdmin
      .from('metric_snapshots')
      .upsert(
        {
          captured_at,
          source: 'yt_channel',
          entity_id: ch.id,
          project_id: ch.project_id,
          subscribers: ch.subscriber_count,
          views,
          likes,
          videos: vids?.length ?? ch.video_count,
        },
        { onConflict: 'captured_at,source,entity_id' },
      )

    if (error) {
      log.warn({ err: error.message, channelId: ch.id }, 'snapshot upsert failed')
    } else {
      channelsWritten += 1
    }
  }

  // Unisender — single global list, one snapshot. Failure here is non-fatal.
  let newsletter = false
  try {
    const count = await getContactCount()
    const { error } = await supabaseAdmin
      .from('metric_snapshots')
      .upsert(
        {
          captured_at,
          source: 'unisender',
          entity_id: 'unisender_default',
          project_id: null,
          subscribers: count,
        },
        { onConflict: 'captured_at,source,entity_id' },
      )
    if (error) log.warn({ err: error.message }, 'unisender snapshot failed')
    else newsletter = true
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'unisender getContactCount failed')
  }

  log.info({ channels: channelsWritten, newsletter }, 'snapshot done')
  return { channels: channelsWritten, newsletter }
}
