import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// POST /api/projects/assign — assign channel to project
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { channelId, projectId, type = 'yt' } = await req.json()

  if (!channelId) {
    return NextResponse.json({ error: 'channelId is required' }, { status: 400 })
  }

  const table = type === 'tg' ? 'tg_channels' : 'yt_channels'

  const { error } = await supabaseAdmin
    .from(table)
    .update({ project_id: projectId ?? null })
    .eq('id', channelId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
