import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getSession } from '@/lib/session'

// GET /api/dashboard/metrics
// Server-side aggregation — avoids shipping 500+ video rows to the client
// just to compute SUM(views) / SUM(likes). Also computes real W/W growth.
export async function GET(): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const session = await getSession()
  const projectId = session.activeProjectId ?? null

  // Channels in active project
  let chQuery = supabaseAdmin
    .from('yt_channels')
    .select('id, title, handle, thumbnail_url, subscriber_count, video_count')

  if (projectId) chQuery = chQuery.eq('project_id', projectId)

  const { data: channels, error: chErr } = await chQuery
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 500 })

  const channelIds = (channels ?? []).map(c => c.id)
  if (channelIds.length === 0) {
    return NextResponse.json({ channels: [], totals: emptyTotals(), growth: { subscribers: null, views: null } })
  }

  // Fetch only the fields we aggregate over — skips heavy JSONB/text columns.
  const { data: videos, error: vErr } = await supabaseAdmin
    .from('yt_videos')
    .select('channel_id, view_count, like_count, published_at')
    .in('channel_id', channelIds)

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 })

  // Per-channel aggregation
  interface ChStats { views: number; likes: number; count: number }
  const perChannel = new Map<string, ChStats>()
  for (const id of channelIds) perChannel.set(id, { views: 0, likes: 0, count: 0 })

  let totalViews = 0
  let totalLikes = 0
  let totalVideos = 0

  const now = Date.now()
  const d30 = now - 30 * 86400 * 1000
  const d60 = now - 60 * 86400 * 1000
  let viewsLast30 = 0
  let viewsPrior30 = 0
  let videosLast30 = 0
  let videosPrior30 = 0

  for (const v of videos ?? []) {
    const s = perChannel.get(v.channel_id)
    if (s) {
      s.views += v.view_count ?? 0
      s.likes += v.like_count ?? 0
      s.count += 1
    }
    totalViews  += v.view_count ?? 0
    totalLikes  += v.like_count ?? 0
    totalVideos += 1

    // Growth window — use published_at; missing dates skipped.
    if (v.published_at) {
      const ts = new Date(v.published_at).getTime()
      if (ts >= d30) {
        viewsLast30 += v.view_count ?? 0
        videosLast30 += 1
      } else if (ts >= d60) {
        viewsPrior30 += v.view_count ?? 0
        videosPrior30 += 1
      }
    }
  }

  const totalSubscribers = (channels ?? []).reduce((s, c) => s + (c.subscriber_count ?? 0), 0)
  const engagementPct = totalViews > 0 ? (totalLikes / totalViews) * 100 : null

  const growthViewsPct = viewsPrior30 > 0
    ? Number((((viewsLast30 - viewsPrior30) / viewsPrior30) * 100).toFixed(1))
    : null

  const growthVideosDelta = videosLast30 - videosPrior30

  const channelsEnriched = (channels ?? []).map(c => {
    const s = perChannel.get(c.id) ?? { views: 0, likes: 0, count: 0 }
    const eng = s.views > 0 ? (s.likes / s.views) * 100 : null
    return {
      id: c.id,
      title: c.title,
      handle: c.handle,
      thumbnail_url: c.thumbnail_url,
      subscribers: c.subscriber_count ?? 0,
      views: s.views,
      videos: s.count || (c.video_count ?? 0),
      engagement: eng !== null ? Number(eng.toFixed(2)) : null,
    }
  })

  return NextResponse.json({
    channels: channelsEnriched,
    totals: {
      subscribers: totalSubscribers,
      views: totalViews,
      likes: totalLikes,
      videos: totalVideos,
      engagement: engagementPct !== null ? Number(engagementPct.toFixed(2)) : null,
    },
    growth: {
      viewsPct: growthViewsPct,  // % change in sum(views) over videos from last 30 vs prior 30 days
      videosDelta: growthVideosDelta,
    },
  })
}

function emptyTotals() {
  return { subscribers: 0, views: 0, likes: 0, videos: 0, engagement: null as number | null }
}
