import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// GET /api/carousels/source-videos — videos with transcripts for carousel wizard
export async function GET(): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { data, error } = await supabaseAdmin
    .from('yt_videos')
    .select('id, current_title, generated_title, transcript, published_at, duration_seconds')
    .not('transcript', 'is', null)
    .order('published_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ videos: data ?? [] })
}
