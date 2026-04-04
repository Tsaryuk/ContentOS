import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// POST /api/projects/assign — assign channel to project
export async function POST(req: NextRequest) {
  const { channelId, projectId } = await req.json()

  if (!channelId || !projectId) {
    return NextResponse.json({ error: 'channelId and projectId are required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('yt_channels')
    .update({ project_id: projectId })
    .eq('id', channelId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
