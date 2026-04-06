import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/projects — all projects with their channels (unfiltered for settings)
export async function GET() {
  const [{ data: projects }, { data: channels }, { data: tgChannels }] = await Promise.all([
    supabaseAdmin
      .from('projects')
      .select('id, name, color, slug')
      .order('name'),
    supabaseAdmin
      .from('yt_channels')
      .select('id, yt_channel_id, title, handle, thumbnail_url, project_id, google_account_id, is_active, subscriber_count, video_count')
      .order('title'),
    supabaseAdmin
      .from('tg_channels')
      .select('id, title, username, project_id, is_active')
      .eq('is_active', true)
      .order('title'),
  ])

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
