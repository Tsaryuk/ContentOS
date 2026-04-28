import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

interface LogRow {
  id: string
  reply_text: string
  mode: 'auto' | 'manual'
  status: 'sent' | 'failed' | 'skipped'
  yt_reply_id: string | null
  error: string | null
  created_at: string
  comment_id: string
  yt_comments: {
    id: string
    yt_comment_id: string
    text: string
    author_name: string
    yt_videos: {
      id: string
      yt_video_id: string
      current_title: string | null
    } | null
  } | null
}

// GET /api/comments/log?channelId=&limit=50&days=7
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const channelId = req.nextUrl.searchParams.get('channelId')
  if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 })

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10) || 50, 200)
  const days = Math.min(parseInt(req.nextUrl.searchParams.get('days') ?? '7', 10) || 7, 90)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('comment_reply_log')
    .select(
      'id, reply_text, mode, status, yt_reply_id, error, created_at, comment_id, yt_comments!inner(id, yt_comment_id, text, author_name, yt_videos(id, yt_video_id, current_title))',
    )
    .eq('channel_id', channelId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data as unknown as LogRow[] | null) ?? []
  const items = rows.map((row) => ({
    id: row.id,
    reply_text: row.reply_text,
    mode: row.mode,
    status: row.status,
    yt_reply_id: row.yt_reply_id,
    error: row.error,
    created_at: row.created_at,
    comment_text: row.yt_comments?.text ?? null,
    comment_author: row.yt_comments?.author_name ?? null,
    yt_comment_id: row.yt_comments?.yt_comment_id ?? null,
    video_title: row.yt_comments?.yt_videos?.current_title ?? null,
    yt_video_id: row.yt_comments?.yt_videos?.yt_video_id ?? null,
  }))

  return NextResponse.json({ items })
}
