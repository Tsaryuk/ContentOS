import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

const FULL_SELECT =
  'id, yt_video_id, current_title, current_thumbnail, current_description, duration_seconds, published_at, view_count, like_count, status, ai_score, is_approved, is_published_back, generated_title, generated_description, privacy_status, guest_name, guest_title, parent_video_id, shorts_status'

const PODCAST_SELECT = 'id, yt_video_id, current_title'

// GET /api/youtube/by-channel?channelId=<uuid>&mode=full|podcasts
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const channelId = req.nextUrl.searchParams.get('channelId')
  if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 })

  const mode = req.nextUrl.searchParams.get('mode') ?? 'full'

  let query = supabaseAdmin
    .from('yt_videos')
    .select(mode === 'podcasts' ? PODCAST_SELECT : FULL_SELECT)
    .eq('channel_id', channelId)
    .order('published_at', { ascending: false })

  if (mode === 'podcasts') {
    query = query.gt('duration_seconds', 180)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ videos: data ?? [] })
}
