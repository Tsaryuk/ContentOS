import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getSession } from '@/lib/session'

// GET /api/dashboard/metrics?period=day|week|month
// Returns per-channel + total metrics, plus growth deltas computed from
// metric_snapshots rows (populated daily by the worker cron).
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const session = await getSession()
  const projectId = session.activeProjectId ?? null

  const period = (req.nextUrl.searchParams.get('period') ?? 'week') as 'day' | 'week' | 'month'
  const periodDays = period === 'day' ? 1 : period === 'month' ? 30 : 7

  // Channels in active project
  let chQuery = supabaseAdmin
    .from('yt_channels')
    .select('id, title, handle, thumbnail_url, subscriber_count, video_count')

  if (projectId) chQuery = chQuery.eq('project_id', projectId)

  const { data: channels, error: chErr } = await chQuery
  if (chErr) return NextResponse.json({ error: chErr.message }, { status: 500 })

  const channelIds = (channels ?? []).map(c => c.id)
  if (channelIds.length === 0) {
    return NextResponse.json({
      period, periodDays,
      channels: [],
      totals: emptyTotals(),
      growth: emptyGrowth(),
      newsletter: await getNewsletterMetrics(periodDays),
    })
  }

  const { data: videos, error: vErr } = await supabaseAdmin
    .from('yt_videos')
    .select('channel_id, view_count, like_count, published_at')
    .in('channel_id', channelIds)

  if (vErr) return NextResponse.json({ error: vErr.message }, { status: 500 })

  interface ChStats { views: number; likes: number; count: number }
  const perChannel = new Map<string, ChStats>()
  for (const id of channelIds) perChannel.set(id, { views: 0, likes: 0, count: 0 })

  let totalViews = 0
  let totalLikes = 0
  let totalVideos = 0

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
  }

  const totalSubscribers = (channels ?? []).reduce((s, c) => s + (c.subscriber_count ?? 0), 0)
  const engagementPct = totalViews > 0 ? (totalLikes / totalViews) * 100 : null

  // --- Growth from metric_snapshots ---
  const nDaysAgoDate = daysAgoISODate(periodDays)
  const { data: snapshots } = await supabaseAdmin
    .from('metric_snapshots')
    .select('entity_id, captured_at, subscribers, views')
    .eq('source', 'yt_channel')
    .in('entity_id', channelIds)
    .lte('captured_at', nDaysAgoDate)
    .order('captured_at', { ascending: false })

  // For each channel take the FIRST (latest) snapshot <= cutoff date
  const baselineByChannel = new Map<string, { subscribers: number; views: number }>()
  for (const row of snapshots ?? []) {
    if (!baselineByChannel.has(row.entity_id)) {
      baselineByChannel.set(row.entity_id, {
        subscribers: Number(row.subscribers ?? 0),
        views: Number(row.views ?? 0),
      })
    }
  }

  let baselineTotalSubs = 0
  let baselineTotalViews = 0
  const growthByChannel = new Map<string, { subsDelta: number; viewsDelta: number }>()
  for (const c of channels ?? []) {
    const base = baselineByChannel.get(c.id)
    if (base) {
      baselineTotalSubs  += base.subscribers
      baselineTotalViews += base.views
      const st = perChannel.get(c.id) ?? { views: 0, likes: 0, count: 0 }
      growthByChannel.set(c.id, {
        subsDelta:  (c.subscriber_count ?? 0) - base.subscribers,
        viewsDelta: st.views - base.views,
      })
    }
  }

  const subsDelta  = baselineTotalSubs  > 0 ? totalSubscribers - baselineTotalSubs  : null
  const viewsDelta = baselineTotalViews > 0 ? totalViews       - baselineTotalViews : null
  const subsPct    = baselineTotalSubs  > 0 ? Number(((totalSubscribers - baselineTotalSubs) / baselineTotalSubs * 100).toFixed(2))  : null
  const viewsPct   = baselineTotalViews > 0 ? Number(((totalViews       - baselineTotalViews) / baselineTotalViews * 100).toFixed(2)) : null

  const channelsEnriched = (channels ?? []).map(c => {
    const s = perChannel.get(c.id) ?? { views: 0, likes: 0, count: 0 }
    const eng = s.views > 0 ? (s.likes / s.views) * 100 : null
    const g = growthByChannel.get(c.id) ?? null
    return {
      id: c.id,
      title: c.title,
      handle: c.handle,
      thumbnail_url: c.thumbnail_url,
      subscribers: c.subscriber_count ?? 0,
      views: s.views,
      videos: s.count || (c.video_count ?? 0),
      engagement: eng !== null ? Number(eng.toFixed(2)) : null,
      growth: g,
    }
  })

  const newsletter = await getNewsletterMetrics(periodDays)

  return NextResponse.json({
    period, periodDays,
    channels: channelsEnriched,
    totals: {
      subscribers: totalSubscribers,
      views: totalViews,
      likes: totalLikes,
      videos: totalVideos,
      engagement: engagementPct !== null ? Number(engagementPct.toFixed(2)) : null,
    },
    growth: {
      subscribersDelta: subsDelta,
      subscribersPct:   subsPct,
      viewsDelta:       viewsDelta,
      viewsPct:         viewsPct,
    },
    newsletter,
  })
}

function emptyTotals() {
  return { subscribers: 0, views: 0, likes: 0, videos: 0, engagement: null as number | null }
}

function emptyGrowth() {
  return { subscribersDelta: null, subscribersPct: null, viewsDelta: null, viewsPct: null }
}

function daysAgoISODate(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

interface NewsletterMetrics {
  subscribers: number | null
  subscribersDelta: number | null
  subscribersPct: number | null
}

async function getNewsletterMetrics(periodDays: number): Promise<NewsletterMetrics> {
  // Latest snapshot + baseline ≥ periodDays old
  const { data: latest } = await supabaseAdmin
    .from('metric_snapshots')
    .select('subscribers, captured_at')
    .eq('source', 'unisender')
    .eq('entity_id', 'unisender_default')
    .order('captured_at', { ascending: false })
    .limit(1)

  const { data: baseline } = await supabaseAdmin
    .from('metric_snapshots')
    .select('subscribers, captured_at')
    .eq('source', 'unisender')
    .eq('entity_id', 'unisender_default')
    .lte('captured_at', daysAgoISODate(periodDays))
    .order('captured_at', { ascending: false })
    .limit(1)

  const latestSubs   = latest?.[0]?.subscribers != null ? Number(latest[0].subscribers) : null
  const baselineSubs = baseline?.[0]?.subscribers != null ? Number(baseline[0].subscribers) : null

  if (latestSubs === null) return { subscribers: null, subscribersDelta: null, subscribersPct: null }
  if (baselineSubs === null || baselineSubs === 0) {
    return { subscribers: latestSubs, subscribersDelta: null, subscribersPct: null }
  }
  const delta = latestSubs - baselineSubs
  const pct = Number(((delta / baselineSubs) * 100).toFixed(2))
  return { subscribers: latestSubs, subscribersDelta: delta, subscribersPct: pct }
}
