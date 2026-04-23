import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// GET /api/clips/list — videos with transcripts + clip counts per video
export async function GET(): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const [videosRes, clipsRes] = await Promise.all([
    supabaseAdmin
      .from('yt_videos')
      .select('id, current_title, current_thumbnail, duration_seconds')
      .not('transcript', 'is', null)
      .order('published_at', { ascending: false })
      .limit(50),
    supabaseAdmin
      .from('clip_candidates')
      .select('video_id'),
  ])

  if (videosRes.error) return NextResponse.json({ error: videosRes.error.message }, { status: 500 })
  if (clipsRes.error) return NextResponse.json({ error: clipsRes.error.message }, { status: 500 })

  const counts: Record<string, number> = {}
  for (const c of clipsRes.data ?? []) {
    const videoId = (c as { video_id: string }).video_id
    counts[videoId] = (counts[videoId] ?? 0) + 1
  }

  return NextResponse.json({ videos: videosRes.data ?? [], counts })
}
