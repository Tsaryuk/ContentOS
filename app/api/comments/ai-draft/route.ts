import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'
import {
  DEFAULT_COMMENT_REPLY_CONFIG,
  buildCommentReplySystemPrompt,
  buildCommentReplyUserPrompt,
  decideCta,
  type CommentReplyConfig,
  type TranscriptChunk,
} from '@/lib/youtube/comment-reply-prompts'
import { pickContextChunks } from '@/lib/youtube/transcript-rag'

const anthropic = new Anthropic()

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

// POST /api/comments/ai-draft — generate AI reply draft for a comment
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

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

    let parentReplyText: string | null = null
    if (comment.parent_comment_id) {
      const { data: parent } = await supabaseAdmin
        .from('yt_comments')
        .select('text, is_owner_reply')
        .eq('yt_comment_id', comment.parent_comment_id)
        .maybeSingle<{ text: string; is_owner_reply: boolean }>()
      if (parent?.is_owner_reply) parentReplyText = parent.text
    }

    const shouldIncludeCta = decideCta(config.cta_frequency)

    const system = buildCommentReplySystemPrompt({
      channelTitle: channel?.title ?? '',
      channelHandle: channel?.handle ?? null,
      tone: config.tone,
      telegramUrl: config.telegram_url,
      communityUrl: config.community_url,
      maxLength: config.max_reply_length,
      shouldIncludeCta,
    })

    const ragChunks = await pickContextChunks(
      video.id,
      video.transcript,
      comment.text,
      video.transcript_chunks,
    )

    const user = buildCommentReplyUserPrompt({
      videoTitle: video.current_title ?? '',
      videoDescription: video.current_description,
      // When RAG kicks in, drop the full text so the prompt uses chunks only.
      transcript: ragChunks ? null : video.transcript,
      transcriptChunks: ragChunks ?? video.transcript_chunks,
      commentText: comment.text,
      commentAuthor: comment.author_name,
      parentReplyText,
      shouldIncludeCta,
    })

    const msg = await anthropic.messages.create({
      model: AI_MODELS.claude,
      max_tokens: 800,
      system,
      messages: [{ role: 'user', content: user }],
    })

    const draft = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    await supabaseAdmin
      .from('yt_comments')
      .update({
        ai_reply_draft: draft,
        ai_reply_model: AI_MODELS.claude,
        ai_reply_generated_at: new Date().toISOString(),
      })
      .eq('id', comment.id)

    return NextResponse.json({ success: true, draft, cta: shouldIncludeCta })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[comments/ai-draft]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
