// Generate an AI reply draft for a single comment.
//
// Used by two callers:
//   1. POST /api/comments/ai-draft — manual generation from the UI
//      (queue tab, channel page).
//   2. lib/youtube/comment-auto-reply.ts — cron-driven runner.
//
// Both used to have identical inline code. Centralising it here means
// prompt tuning (PR #82 examples, PR #83 CTA targets, future
// per-content-type tone) lands in one place and stays consistent.

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { AI_MODELS } from '@/lib/ai-models'
import {
  buildCommentReplySystemPrompt,
  buildCommentReplyUserPrompt,
  decideCta,
  type CommentReplyConfig,
  type TranscriptChunk,
} from '@/lib/youtube/comment-reply-prompts'
import { pickContextChunks } from '@/lib/youtube/transcript-rag'
import { loadRecentReplyExamples } from '@/lib/youtube/recent-reply-examples'
import { loadCtaTargets } from '@/lib/youtube/cta-targets'

const anthropic = new Anthropic()

export interface DraftCommentInput {
  /** UUID in yt_comments. */
  id: string
  text: string
  author_name: string
  /** YouTube comment id of the parent — only set on replies. */
  parent_comment_id: string | null
}

export interface DraftVideoInput {
  id: string
  current_title: string | null
  current_description: string | null
  transcript: string | null
  transcript_chunks: TranscriptChunk[] | null
}

export interface DraftChannelInput {
  id: string
  title: string
  handle: string | null
}

export interface GenerateDraftArgs {
  comment: DraftCommentInput
  video: DraftVideoInput
  channel: DraftChannelInput
  config: CommentReplyConfig
}

export interface GenerateDraftResult {
  draft: string
  /** Whether the prompt instructed the model to consider a CTA. */
  ctaConsidered: boolean
}

/**
 * Builds the prompt (system + user) with all current contextual layers
 * (tone, examples, RAG transcript chunks, allowed CTA projects,
 * parent-thread context), calls Anthropic, and persists the result back
 * onto yt_comments.ai_reply_draft.
 *
 * Throws on Anthropic / DB errors so callers can decide how to handle
 * (manual UI shows a toast, auto-reply runner logs & skips the candidate).
 */
export async function generateCommentDraft({
  comment,
  video,
  channel,
  config,
}: GenerateDraftArgs): Promise<GenerateDraftResult> {
  const shouldIncludeCta = decideCta(config.cta_frequency)

  // Parent comment context — only when the parent was our own reply,
  // so the model knows it's continuing a thread it started, not just
  // any random nested comment.
  let parentReplyText: string | null = null
  if (comment.parent_comment_id) {
    const { data: parent } = await supabaseAdmin
      .from('yt_comments')
      .select('text, is_owner_reply')
      .eq('yt_comment_id', comment.parent_comment_id)
      .maybeSingle<{ text: string; is_owner_reply: boolean }>()
    if (parent?.is_owner_reply) parentReplyText = parent.text
  }

  // Heavy reads in parallel. examples + CTA projects + transcript RAG
  // are all independent.
  const [examples, ctaProjects, ragChunks] = await Promise.all([
    loadRecentReplyExamples(channel.id, 5),
    loadCtaTargets(config.cta_project_ids ?? []),
    pickContextChunks(video.id, video.transcript, comment.text, video.transcript_chunks),
  ])

  const system = buildCommentReplySystemPrompt({
    channelTitle: channel.title,
    channelHandle: channel.handle,
    tone: config.tone,
    telegramUrl: config.telegram_url,
    communityUrl: config.community_url,
    maxLength: config.max_reply_length,
    shouldIncludeCta,
    examples,
    ctaProjects,
  })

  const user = buildCommentReplyUserPrompt({
    videoTitle: video.current_title ?? '',
    videoDescription: video.current_description,
    // When RAG kicks in we drop the full transcript so the prompt only
    // sees relevant chunks.
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

  if (draft) {
    await supabaseAdmin
      .from('yt_comments')
      .update({
        ai_reply_draft: draft,
        ai_reply_model: AI_MODELS.claude,
        ai_reply_generated_at: new Date().toISOString(),
      })
      .eq('id', comment.id)
  }

  return { draft, ctaConsidered: shouldIncludeCta }
}
