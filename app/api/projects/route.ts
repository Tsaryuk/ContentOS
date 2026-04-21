import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { buildUniqueProjectSlug } from '@/lib/projects/slug'

// GET /api/projects — projects with channels
// ?all=true returns all channels (for settings), otherwise filters by active project
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

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

// POST /api/projects — create new project (admin only)
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { name, color } = await req.json()
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Название не может быть пустым' }, { status: 400 })
  }
  // Auto-suffix on conflict so creating a new project never 500s on an
  // existing slug — see lib/projects/slug.ts.
  const slug = await buildUniqueProjectSlug(name.trim())
  if (!slug) {
    return NextResponse.json({ error: 'Название должно содержать латинские буквы или цифры' }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin
    .from('projects')
    .insert({ name: name.trim(), color: color ?? '#a67ff0', slug })
    .select('id, name, color, slug')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
