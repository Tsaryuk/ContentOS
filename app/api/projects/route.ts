import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// GET /api/projects — all projects with their channels
export async function GET() {
  const { data: projects } = await supabaseAdmin
    .from('projects')
    .select('id, name, color, slug')
    .order('name')

  const { data: channels } = await supabaseAdmin
    .from('yt_channels')
    .select('id, yt_channel_id, title, handle, thumbnail_url, project_id, google_account_id, is_active')
    .order('title')

  return NextResponse.json({ projects: projects ?? [], channels: channels ?? [] })
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
