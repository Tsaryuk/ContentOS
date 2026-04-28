import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getYouTubeToken } from '@/lib/youtube/auth'
import { youtubeErrorResponse } from '@/lib/youtube/errors'
import {
  DEFAULT_COMMENT_REPLY_CONFIG,
  type CommentReplyConfig,
} from '@/lib/youtube/comment-reply-prompts'

interface ReplyRequest {
  commentId: string
  text: string
  videoId: string
  mode?: 'manual' | 'auto'
}

// POST /api/comments/reply — reply to a YouTube comment.
// Enforces daily_limit, dedup, kill switch, thread_depth.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  if (process.env.COMMENTS_AUTO_REPLY_GLOBAL_DISABLE === 'true') {
    // Hard kill switch — applies to manual sends too so the operator can pause everything.
    return NextResponse.json(
      { error: 'Comment replies temporarily disabled by operator.' },
      { status: 503 },
    )
  }

  let body: ReplyRequest
  try {
    body = (await req.json()) as ReplyRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { commentId, text, videoId, mode = 'manual' } = body
  if (!commentId || !text || !videoId) {
    return NextResponse.json({ error: 'commentId, text, videoId required' }, { status: 400 })
  }

  // Resolve channel + parent comment row.
  const { data: video } = await supabaseAdmin
    .from('yt_videos')
    .select('id, channel_id')
    .eq('id', videoId)
    .maybeSingle<{ id: string; channel_id: string }>()

  if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

  const { data: parentComment } = await supabaseAdmin
    .from('yt_comments')
    .select('id, yt_comment_id, parent_comment_id, ai_reply_yt_id, ai_reply_sent_at')
    .eq('yt_comment_id', commentId)
    .maybeSingle<{
      id: string
      yt_comment_id: string
      parent_comment_id: string | null
      ai_reply_yt_id: string | null
      ai_reply_sent_at: string | null
    }>()

  if (!parentComment) {
    return NextResponse.json({ error: 'Comment not found in DB' }, { status: 404 })
  }

  // Dedup: never send twice.
  if (parentComment.ai_reply_yt_id) {
    return NextResponse.json({ error: 'Already replied to this comment' }, { status: 409 })
  }

  const { data: existingLog } = await supabaseAdmin
    .from('comment_reply_log')
    .select('id')
    .eq('comment_id', parentComment.id)
    .eq('status', 'sent')
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (existingLog) {
    return NextResponse.json({ error: 'Already replied to this comment' }, { status: 409 })
  }

  // Channel rules — daily limit + thread depth.
  const { data: channel } = await supabaseAdmin
    .from('yt_channels')
    .select('id, rules')
    .eq('id', video.channel_id)
    .maybeSingle<{ id: string; rules: { comments?: Partial<CommentReplyConfig> } | null }>()

  const config: CommentReplyConfig = {
    ...DEFAULT_COMMENT_REPLY_CONFIG,
    ...(channel?.rules?.comments ?? {}),
  }

  // Daily limit (rolling 24h, sent only).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: dailyCount } = await supabaseAdmin
    .from('comment_reply_log')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', video.channel_id)
    .eq('status', 'sent')
    .gte('created_at', since)

  if ((dailyCount ?? 0) >= config.daily_limit) {
    return NextResponse.json(
      { error: 'Daily reply limit reached for this channel', daily_limit: config.daily_limit },
      { status: 429 },
    )
  }

  // Thread depth: if parent is itself a reply to one of our replies, allow only one extra level.
  if (parentComment.parent_comment_id) {
    const { data: rootChain } = await supabaseAdmin
      .from('yt_comments')
      .select('yt_comment_id, parent_comment_id, ai_reply_yt_id')
      .eq('yt_comment_id', parentComment.parent_comment_id)
      .maybeSingle<{
        yt_comment_id: string
        parent_comment_id: string | null
        ai_reply_yt_id: string | null
      }>()

    // Count our sent replies in this thread root.
    const rootYtId = rootChain?.parent_comment_id ?? rootChain?.yt_comment_id ?? null
    if (rootYtId && config.thread_depth < 2) {
      const { data: threadComments } = await supabaseAdmin
        .from('yt_comments')
        .select('id')
        .or(`yt_comment_id.eq.${rootYtId},parent_comment_id.eq.${rootYtId}`)

      const threadIds = (threadComments ?? []).map((c) => c.id)
      if (threadIds.length > 0) {
        const { count: sentInThread } = await supabaseAdmin
          .from('comment_reply_log')
          .select('id', { count: 'exact', head: true })
          .eq('channel_id', video.channel_id)
          .eq('status', 'sent')
          .in('comment_id', threadIds)

        if ((sentInThread ?? 0) > config.thread_depth) {
          return NextResponse.json(
            { error: 'Thread depth limit reached', thread_depth: config.thread_depth },
            { status: 429 },
          )
        }
      }
    }
  }

  try {
    const token = await getYouTubeToken({ id: video.channel_id })

    const res = await fetch('https://www.googleapis.com/youtube/v3/comments?part=snippet', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippet: { parentId: commentId, textOriginal: text },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      const errMsg = `YouTube reply failed: ${res.status} ${errText.slice(0, 200)}`

      await supabaseAdmin.from('comment_reply_log').insert({
        channel_id: video.channel_id,
        comment_id: parentComment.id,
        reply_text: text,
        mode,
        status: 'failed',
        error: errMsg,
      })

      throw new Error(errMsg)
    }

    const reply = await res.json()
    const nowIso = new Date().toISOString()

    // Persist the published reply as its own comment row.
    await supabaseAdmin.from('yt_comments').upsert(
      {
        video_id: videoId,
        yt_comment_id: reply.id,
        parent_comment_id: commentId,
        author_name: reply.snippet.authorDisplayName,
        author_channel_id: reply.snippet.authorChannelId?.value,
        author_avatar: reply.snippet.authorProfileImageUrl,
        text: reply.snippet.textDisplay,
        like_count: 0,
        reply_count: 0,
        published_at: reply.snippet.publishedAt,
        is_owner_reply: true,
        status: 'replied',
      },
      { onConflict: 'yt_comment_id' },
    )

    // Update parent comment with our reply metadata.
    await supabaseAdmin
      .from('yt_comments')
      .update({
        status: 'replied',
        ai_reply_sent_at: nowIso,
        ai_reply_yt_id: reply.id,
      })
      .eq('id', parentComment.id)

    await supabaseAdmin.from('comment_reply_log').insert({
      channel_id: video.channel_id,
      comment_id: parentComment.id,
      reply_text: text,
      mode,
      status: 'sent',
      yt_reply_id: reply.id,
    })

    return NextResponse.json({ success: true, replyId: reply.id })
  } catch (err: unknown) {
    console.error('[comments/reply]', err instanceof Error ? err.message : err)
    return youtubeErrorResponse(err)
  }
}
