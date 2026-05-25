// Manual AI-draft endpoint. The heavy lifting (prompt build + Anthropic
// call + DB persist) lives in lib/youtube/comment-draft.ts so both this
// route and the cron-driven auto-reply runner stay in lockstep on
// prompt + retrieval behaviour.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import {
  DEFAULT_COMMENT_REPLY_CONFIG,
  type CommentReplyConfig,
  type TranscriptChunk,
} from '@/lib/youtube/comment-reply-prompts'
import { generateCommentDraft } from '@/lib/youtube/comment-draft'
import { rateLimit, clientIp, rateLimitResponse } from '@/lib/rate-limit'

interface ChannelRow {
  id: string
  title: string
  handle: string | null
  rules: { brand_voice?: string; comments?: Partial<CommentReplyConfig> } | null
}

interface VideoRow {
  id: string
  current_title: string | null
  current_description: string | null
  channel_id: string
  transcript: string | null
  transcript_chunks: TranscriptChunk[] | null
}

interface CommentRow {
  id: string
  yt_comment_id: string
  text: string
  author_name: string
  parent_comment_id: string | null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  // 60/min is higher than other AI buckets because manual review of comment
  // drafts naturally bursts (user clicks through a queue). Auto-reply goes
  // through the worker, not this endpoint, so cron traffic doesn't count.
  const rl = await rateLimit('ai:comment-draft', clientIp(req), 60, 60)
  if (!rl.allowed) return rateLimitResponse(rl)

  try {
    const { commentId, videoId } = await req.json()
    if (!commentId || !videoId) {
      return NextResponse.json({ error: 'commentId, videoId required' }, { status: 400 })
    }

    const { data: comment } = await supabaseAdmin
      .from('yt_comments')
      .select('id, yt_comment_id, text, author_name, parent_comment_id')
      .eq('yt_comment_id', commentId)
      .maybeSingle<CommentRow>()
    if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })

    const { data: video } = await supabaseAdmin
      .from('yt_videos')
      .select('id, current_title, current_description, channel_id, transcript, transcript_chunks')
      .eq('id', videoId)
      .maybeSingle<VideoRow>()
    if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

    const { data: channel } = await supabaseAdmin
      .from('yt_channels')
      .select('id, title, handle, rules')
      .eq('id', video.channel_id)
      .maybeSingle<ChannelRow>()

    const config: CommentReplyConfig = {
      ...DEFAULT_COMMENT_REPLY_CONFIG,
      tone: channel?.rules?.brand_voice ?? DEFAULT_COMMENT_REPLY_CONFIG.tone,
      ...(channel?.rules?.comments ?? {}),
    }

    const { draft, ctaConsidered } = await generateCommentDraft({
      comment: {
        id: comment.id,
        text: comment.text,
        author_name: comment.author_name,
        parent_comment_id: comment.parent_comment_id,
      },
      video: {
        id: video.id,
        current_title: video.current_title,
        current_description: video.current_description,
        transcript: video.transcript,
        transcript_chunks: video.transcript_chunks,
      },
      channel: {
        id: channel?.id ?? video.channel_id,
        title: channel?.title ?? '',
        handle: channel?.handle ?? null,
      },
      config,
    })

    return NextResponse.json({ success: true, draft, cta: ctaConsidered })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[comments/ai-draft]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
