/**
 * Refresh a single yt_channel's public stats via YouTube Data API v3.
 *
 * Uses the channel's own OAuth token (videos:readonly scope we already have).
 * On permanent auth failure marks the row needs_reauth=true so UI can prompt
 * the user to re-authorize that brand account.
 *
 * Also writes a fresh row into metric_snapshots so tomorrow's growth deltas
 * reflect today's actual numbers, not the stale DB values.
 */

import { supabaseAdmin } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { getYouTubeToken, YouTubeAuthError } from '@/lib/youtube/auth'

interface YtChannelApiResponse {
  items?: Array<{
    id: string
    snippet?: {
      title?: string
      thumbnails?: { default?: { url?: string } }
    }
    statistics?: {
      subscriberCount?: string
      viewCount?: string
      videoCount?: string
    }
  }>
}

export interface RefreshResult {
  channelId: string
  ok: boolean
  error?: string
  subscribers?: number
  videos?: number
  views?: number
}

export async function refreshChannel(channelUuid: string): Promise<RefreshResult> {
  const log = logger.child({ module: 'refresh-channel', channelId: channelUuid })

  const { data: ch, error: chErr } = await supabaseAdmin
    .from('yt_channels')
    .select('id, yt_channel_id, refresh_token, needs_reauth, project_id')
    .eq('id', channelUuid)
    .single()

  if (chErr || !ch) {
    log.warn({ err: chErr?.message }, 'channel not found')
    return { channelId: channelUuid, ok: false, error: 'channel not found' }
  }
  if (!ch.refresh_token) {
    return { channelId: channelUuid, ok: false, error: 'no refresh token stored' }
  }

  // Resolve access token — getYouTubeToken handles decryption, refresh,
  // and sets needs_reauth on invalid_grant automatically.
  let accessToken: string
  try {
    accessToken = await getYouTubeToken({ id: ch.id })
  } catch (err) {
    if (err instanceof YouTubeAuthError) {
      log.warn({ code: err.code }, 'access token unavailable')
      return { channelId: channelUuid, ok: false, error: err.code }
    }
    throw err
  }

  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(ch.yt_channel_id)}`
  let res: Response
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : String(err) }, 'network error')
    return { channelId: channelUuid, ok: false, error: 'network' }
  }

  if (res.status === 401 || res.status === 403) {
    await supabaseAdmin.from('yt_channels').update({ needs_reauth: true }).eq('id', ch.id)
    return { channelId: channelUuid, ok: false, error: `auth ${res.status}` }
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    log.warn({ status: res.status, body: body.slice(0, 200) }, 'stats request failed')
    return { channelId: channelUuid, ok: false, error: `http ${res.status}` }
  }

  const data = (await res.json().catch(() => ({}))) as YtChannelApiResponse
  const item = data.items?.[0]
  if (!item) {
    return { channelId: channelUuid, ok: false, error: 'channel not returned by API' }
  }

  const subscribers = Number(item.statistics?.subscriberCount ?? 0) || null
  const views       = Number(item.statistics?.viewCount ?? 0) || null
  const videos      = Number(item.statistics?.videoCount ?? 0) || null
  const title       = item.snippet?.title
  const thumbnail   = item.snippet?.thumbnails?.default?.url

  // yt_channels has subscriber_count + video_count but NOT view_count —
  // total views are a sum of yt_videos.view_count and live only in snapshots.
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (subscribers !== null) update.subscriber_count = subscribers
  if (videos      !== null) update.video_count      = videos
  if (title)                update.title            = title
  if (thumbnail)            update.thumbnail_url    = thumbnail

  const { error: updErr } = await supabaseAdmin
    .from('yt_channels')
    .update(update)
    .eq('id', ch.id)

  if (updErr) {
    log.warn({ err: updErr.message }, 'update failed')
    return { channelId: channelUuid, ok: false, error: updErr.message }
  }

  // Snapshot today's values so deltas reflect reality
  const captured_at = new Date().toISOString().slice(0, 10)
  await supabaseAdmin
    .from('metric_snapshots')
    .upsert(
      {
        captured_at,
        source: 'yt_channel',
        entity_id: ch.id,
        project_id: ch.project_id,
        subscribers,
        views,
        videos,
      },
      { onConflict: 'captured_at,source,entity_id' },
    )

  log.info({ subscribers, views, videos }, 'channel stats refreshed')
  return { channelId: channelUuid, ok: true, subscribers: subscribers ?? undefined, views: views ?? undefined, videos: videos ?? undefined }
}

export async function refreshAllChannels(): Promise<{ total: number; ok: number; failed: number }> {
  const log = logger.child({ module: 'refresh-channel', job: 'refreshAll' })
  const { data: channels } = await supabaseAdmin
    .from('yt_channels')
    .select('id')
    .not('refresh_token', 'is', null)

  let ok = 0
  let failed = 0
  for (const c of channels ?? []) {
    const r = await refreshChannel(c.id)
    if (r.ok) ok += 1
    else failed += 1
  }
  log.info({ total: channels?.length ?? 0, ok, failed }, 'refreshAllChannels done')
  return { total: channels?.length ?? 0, ok, failed }
}
