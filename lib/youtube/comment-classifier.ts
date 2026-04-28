// Classify a YouTube comment with Claude into a small structured JSON.
// Result lives in yt_comments.classification + skip_reason — comments with
// skip_reason fall out of the reply queue automatically.

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { AI_MODELS } from '@/lib/ai-models'
import {
  CLASSIFIER_SYSTEM_PROMPT,
  buildClassifierUserPrompt,
} from '@/lib/youtube/comment-reply-prompts'

const anthropic = new Anthropic()

export interface CommentClassification {
  category: 'question' | 'opinion' | 'gratitude' | 'disagreement' | 'spam' | 'toxic' | 'off_topic'
  sentiment: 'positive' | 'neutral' | 'negative'
  toxicity: number
  has_question: boolean
  language: string
  skip_reason: string | null
}

interface CommentRow {
  id: string
  text: string
  author_name: string
  is_owner_reply: boolean
  video_id: string
}

interface VideoRow {
  current_title: string | null
}

export async function classifyComment(commentId: string): Promise<CommentClassification | null> {
  const { data: comment } = await supabaseAdmin
    .from('yt_comments')
    .select('id, text, author_name, is_owner_reply, video_id')
    .eq('id', commentId)
    .maybeSingle<CommentRow>()

  if (!comment) return null

  // Cheap pre-filter: don't burn tokens on owner self-replies.
  if (comment.is_owner_reply) {
    await supabaseAdmin
      .from('yt_comments')
      .update({
        classification: { skip_reason: 'owner_reply' },
        skip_reason: 'owner_reply',
      })
      .eq('id', comment.id)
    return null
  }

  const wordCount = comment.text.trim().split(/\s+/).filter(Boolean).length
  if (wordCount < 3 && !/[?]/.test(comment.text)) {
    await supabaseAdmin
      .from('yt_comments')
      .update({
        classification: { skip_reason: 'too_short' },
        skip_reason: 'too_short',
      })
      .eq('id', comment.id)
    return null
  }

  const { data: video } = await supabaseAdmin
    .from('yt_videos')
    .select('current_title')
    .eq('id', comment.video_id)
    .maybeSingle<VideoRow>()

  const msg = await anthropic.messages.create({
    model: AI_MODELS.claude,
    max_tokens: 200,
    system: CLASSIFIER_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildClassifierUserPrompt({
          commentText: comment.text,
          commentAuthor: comment.author_name,
          videoTitle: video?.current_title ?? '',
        }),
      },
    ],
  })

  const raw = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim()

  const parsed = parseClassification(raw)
  if (!parsed) return null

  await supabaseAdmin
    .from('yt_comments')
    .update({
      classification: parsed,
      skip_reason: parsed.skip_reason,
    })
    .eq('id', comment.id)

  return parsed
}

function parseClassification(raw: string): CommentClassification | null {
  // Claude sometimes wraps JSON in ```json fences despite the strict prompt; strip them.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  let obj: unknown
  try {
    obj = JSON.parse(cleaned)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null

  const o = obj as Record<string, unknown>
  const category = String(o.category ?? 'off_topic') as CommentClassification['category']
  const sentiment = String(o.sentiment ?? 'neutral') as CommentClassification['sentiment']
  const toxicity = typeof o.toxicity === 'number' ? Math.min(1, Math.max(0, o.toxicity)) : 0
  const has_question = Boolean(o.has_question)
  const language = typeof o.language === 'string' ? o.language : 'unknown'
  let skip_reason: string | null = null
  if (o.skip_reason === 'spam' || o.skip_reason === 'too_short' || o.skip_reason === 'negative_toxic') {
    skip_reason = o.skip_reason
  }
  // Belt-and-suspenders: catch toxicity above the threshold even if the model forgot to set skip_reason.
  if (!skip_reason && toxicity >= 0.7) skip_reason = 'negative_toxic'

  return { category, sentiment, toxicity, has_question, language, skip_reason }
}

const BATCH_LIMIT = 25

// Batch-classify recently synced comments that don't yet have classification.
// Called at the end of comments_sync_recent so the queue is pre-filtered.
export async function classifyPendingComments(): Promise<{ ok: number; failed: number }> {
  const { data: rows } = await supabaseAdmin
    .from('yt_comments')
    .select('id')
    .eq('status', 'new')
    .is('parent_comment_id', null)
    .is('classification', null)
    .eq('is_owner_reply', false)
    .order('published_at', { ascending: false })
    .limit(BATCH_LIMIT)

  let ok = 0
  let failed = 0
  for (const row of rows ?? []) {
    try {
      await classifyComment(row.id)
      ok += 1
    } catch (err) {
      failed += 1
      console.error('[classify] failed', row.id, err instanceof Error ? err.message : err)
    }
  }
  return { ok, failed }
}
