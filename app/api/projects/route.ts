import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/session'

// GET /api/projects — projects with channels
// ?all=true returns all channels (for settings), otherwise filters by active project
export async function GET(req: NextRequest) {
  const showAll = req.nextUrl.searchParams.get('all') === 'true'
  const session = await getSession()

  const { data: projects } = await supabaseAdmin
    .from('projects')
    .select('id, name, color, slug')
    .order('name')

  let ytQuery = supabaseAdmin
    .from('yt_channels')
    .select('id, yt_channel_id, title, handle, thumbnail_url, project_id, google_account_id, is_active, subscriber_count, video_count, needs_reauth')
    .order('title')

  let tgQuery = supabaseAdmin
    .from('tg_channels')
    .select('id, title, username, project_id, is_active')
    .eq('is_active', true)
    .order('title')

  if (!showAll && session.activeProjectId) {
    ytQuery = ytQuery.eq('project_id', session.activeProjectId)
    tgQuery = tgQuery.eq('project_id', session.activeProjectId)
  }

  const [{ data: channels }, { data: tgChannels }] = await Promise.all([ytQuery, tgQuery])

  return NextResponse.json({
    projects: projects ?? [],
    channels: channels ?? [],
    tgChannels: tgChannels ?? [],
  })
}

// POST /api/projects — create new project
export async function POST(req: NextRequest) {
  const { name, color } = await req.json()
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  const { data, error } = await supabaseAdmin
    .from('projects')
    .insert({ name, color: color ?? '#a67ff0', slug })
    .select('id, name, color, slug')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
