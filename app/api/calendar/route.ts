import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getSession } from '@/lib/session'

// GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns a unified list of scheduled/published content across the pipelines:
// YouTube videos, Telegram posts, newsletter issues, articles.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const session = await getSession()
  const projectId = session.activeProjectId ?? null

  const from = req.nextUrl.searchParams.get('from')
  const to   = req.nextUrl.searchParams.get('to')
  const fromIso = from ? new Date(from).toISOString() : new Date(Date.now() - 30 * 86400 * 1000).toISOString()
  const toIso   = to   ? new Date(to).toISOString()   : new Date(Date.now() + 30 * 86400 * 1000).toISOString()

  // Videos — use published_at if present, otherwise created_at as a fallback
  // so recently-uploaded-but-unpublished content still shows on the timeline.
  let ytQuery = supabaseAdmin
    .from('yt_videos')
    .select('id, current_title, published_at, created_at, status, channel_id, thumbnail_url, current_thumbnail, yt_channels!inner(project_id, title)')
    .gte('published_at', fromIso)
    .lte('published_at', toIso)
    .order('published_at', { ascending: true })
    .limit(500)

  if (projectId) ytQuery = ytQuery.eq('yt_channels.project_id', projectId)

  // Telegram posts — use scheduled_at or sent_at
  let tgQuery = supabaseAdmin
    .from('tg_posts')
    .select('id, content, scheduled_at, sent_at, status, channel_id, tg_channels!inner(project_id, title)')
    .or(`scheduled_at.gte.${fromIso},sent_at.gte.${fromIso}`)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .limit(200)

  if (projectId) tgQuery = tgQuery.eq('tg_channels.project_id', projectId)

  // Newsletter issues — scheduled_at or sent_at
  let nlQuery = supabaseAdmin
    .from('nl_issues')
    .select('id, title, scheduled_at, sent_at, status, project_id')
    .or(`scheduled_at.gte.${fromIso},sent_at.gte.${fromIso}`)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .limit(100)

  if (projectId) nlQuery = nlQuery.eq('project_id', projectId)

  // Articles — published_at (blog posts)
  let artQuery = supabaseAdmin
    .from('nl_articles')
    .select('id, title, published_at, status, project_id, blog_slug')
    .gte('published_at', fromIso)
    .lte('published_at', toIso)
    .order('published_at', { ascending: true })
    .limit(100)

  if (projectId) artQuery = artQuery.eq('project_id', projectId)

  const [videos, tgPosts, nlIssues, articles] = await Promise.all([
    ytQuery, tgQuery, nlQuery, artQuery,
  ])

  interface CalendarEvent {
    id: string
    kind: 'video' | 'telegram' | 'newsletter' | 'article'
    title: string
    at: string            // ISO timestamp
    status: string
    channel?: string
    url?: string
    thumbnail?: string | null
  }

  const events: CalendarEvent[] = []

  for (const v of videos.data ?? []) {
    const ch = Array.isArray(v.yt_channels) ? v.yt_channels[0] : v.yt_channels
    events.push({
      id: `v:${v.id}`,
      kind: 'video',
      title: v.current_title ?? '',
      at: v.published_at ?? v.created_at,
      status: v.status ?? 'unknown',
      channel: ch?.title,
      url: `/youtube/${v.id}`,
      thumbnail: v.thumbnail_url ?? v.current_thumbnail,
    })
  }
  for (const p of tgPosts.data ?? []) {
    const ch = Array.isArray(p.tg_channels) ? p.tg_channels[0] : p.tg_channels
    const at = p.scheduled_at ?? p.sent_at
    if (!at) continue
    events.push({
      id: `tg:${p.id}`,
      kind: 'telegram',
      title: (p.content ?? '').slice(0, 80),
      at,
      status: p.status ?? 'unknown',
      channel: ch?.title,
      url: `/telegram`,
    })
  }
  for (const i of nlIssues.data ?? []) {
    const at = i.scheduled_at ?? i.sent_at
    if (!at) continue
    events.push({
      id: `nl:${i.id}`,
      kind: 'newsletter',
      title: i.title ?? 'Выпуск рассылки',
      at,
      status: i.status ?? 'unknown',
      url: `/newsletter/${i.id}`,
    })
  }
  for (const a of articles.data ?? []) {
    if (!a.published_at) continue
    events.push({
      id: `art:${a.id}`,
      kind: 'article',
      title: a.title ?? 'Статья',
      at: a.published_at,
      status: a.status ?? 'unknown',
      url: `/articles/${a.id}`,
    })
  }

  events.sort((a, b) => a.at.localeCompare(b.at))

  return NextResponse.json({ from: fromIso, to: toIso, projectId, events })
}
