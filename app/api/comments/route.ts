import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// GET /api/comments?videoId=X&status=new&limit=50
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const videoId = req.nextUrl.searchParams.get('videoId')
  const status = req.nextUrl.searchParams.get('status')
  const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '50')

  let query = supabaseAdmin
    .from('yt_comments')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit)

  if (videoId) query = query.eq('video_id', videoId)
  if (status) query = query.eq('status', status)

  // Only top-level comments (not replies)
  query = query.is('parent_comment_id', null)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ comments: data ?? [] })
}
