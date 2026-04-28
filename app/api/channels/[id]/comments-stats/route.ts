import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import {
  DEFAULT_COMMENT_REPLY_CONFIG,
  type CommentReplyConfig,
} from '@/lib/youtube/comment-reply-prompts'

interface StatsResponse {
  daily_used: number
  daily_limit: number
  queue_size: number
  replied_today: number
  replied_total: number
  auto_reply: boolean
  kill_switch: boolean
}

// GET /api/channels/[id]/comments-stats — counters for the Comments dashboard.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const { data: channel } = await supabaseAdmin
    .from('yt_channels')
    .select('id, rules')
    .eq('id', id)
    .maybeSingle<{ id: string; rules: { comments?: Partial<CommentReplyConfig> } | null }>()

  if (!channel) return NextResponse.json({ error: 'Канал не найден' }, { status: 404 })

  const config: CommentReplyConfig = {
    ...DEFAULT_COMMENT_REPLY_CONFIG,
    ...(channel.rules?.comments ?? {}),
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [
    { count: dailyUsed },
    { count: repliedTotal },
    { count: queueSize },
  ] = await Promise.all([
    supabaseAdmin
      .from('comment_reply_log')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', id)
      .eq('status', 'sent')
      .gte('created_at', since24h),
    supabaseAdmin
      .from('comment_reply_log')
      .select('id', { count: 'exact', head: true })
      .eq('channel_id', id)
      .eq('status', 'sent'),
    supabaseAdmin
      .from('yt_comments')
      .select('id, yt_videos!inner(channel_id)', { count: 'exact', head: true })
      .is('parent_comment_id', null)
      .eq('status', 'new')
      .is('skip_reason', null)
      .eq('is_owner_reply', false)
      .eq('yt_videos.channel_id', id),
  ])

  const body: StatsResponse = {
    daily_used: dailyUsed ?? 0,
    daily_limit: config.daily_limit,
    queue_size: queueSize ?? 0,
    replied_today: dailyUsed ?? 0,
    replied_total: repliedTotal ?? 0,
    auto_reply: config.auto_reply,
    kill_switch: process.env.COMMENTS_AUTO_REPLY_GLOBAL_DISABLE === 'true',
  }

  return NextResponse.json(body)
}
