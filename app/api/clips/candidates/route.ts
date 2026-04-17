import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// GET /api/clips/candidates?videoId=xxx
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const videoId = req.nextUrl.searchParams.get('videoId')
  if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('clip_candidates')
    .select('*')
    .eq('video_id', videoId)
    .order('scores->virality_potential', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ candidates: data ?? [] })
}

// Only these fields can be updated via PATCH — prevents arbitrary column tamper.
const CANDIDATE_ALLOWED_FIELDS = new Set([
  'status', 'title', 'caption', 'scores', 'notes',
])

// PATCH /api/clips/candidates — update candidate status/metadata
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const raw = await req.json()
  const { id } = raw
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const update: Record<string, unknown> = {}
  for (const key of Object.keys(raw)) {
    if (CANDIDATE_ALLOWED_FIELDS.has(key)) update[key] = raw[key]
  }
  update.updated_at = new Date().toISOString()

  const { error } = await supabaseAdmin
    .from('clip_candidates')
    .update(update)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
