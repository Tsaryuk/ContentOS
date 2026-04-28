// Cron-driven auto-reply runner. Picks N candidates from the queue for
// channels with rules.comments.auto_reply=true, generates a draft if missing,
// and sends with a human-like jittered delay between sends. Hard-stops on
// daily_limit or kill switch.

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { AI_MODELS } from '@/lib/ai-models'
import {
  DEFAULT_COMMENT_REPLY_CONFIG,
  buildCommentReplySystemPrompt,
  buildCommentReplyUserPrompt,
  decideCta,
  type CommentReplyConfig,
  type TranscriptChunk,
} from '@/lib/youtube/comment-reply-prompts'
import {
  sendCommentReply,
  isAutoReplyGloballyDisabled,
  ReplyError,
} from '@/lib/youtube/comment-reply-engine'
import { classifyComment } from '@/lib/youtube/comment-classifier'

const anthropic = new Anthropic()

const PER_RUN_LIMIT = 5
const DELAY_MIN_MS = 5 * 60 * 1000
const DELAY_MAX_MS = 20 * 60 * 1000

interface ChannelRow {
  id: string
  title: string
  handle: string | null
  rules: { brand_voice?: string; comments?: Partial<CommentReplyConfig> } | null
  needs_reauth: boolean | null
}

interface CandidateRow {
  id: string
  yt_comment_id: string
  text: string
  author_name: string
  parent_comment_id: string | null
  ai_reply_draft: string | null
  classification: { skip_reason?: string | null } | null
  skip_reason: string | null
  is_owner_reply: boolean
  status: string
  published_at: string | null
  video: {
    id: string
    current_title: string | null
    current_description: string | null
    transcript: string | null
    transcript_chunks: TranscriptChunk[] | null
  }
}

interface RawCandidate {
  id: string
  yt_comment_id: string
  text: string
  author_name: string
  parent_comment_id: string | null
  ai_reply_draft: string | null
  classification: { skip_reason?: string | null } | null
  skip_reason: string | null
  is_owner_reply: boolean
  status: string
  published_at: string | null
  yt_videos: {
    id: string
    current_title: string | null
    current_description: string | null
    transcript: string | null
    transcript_chunks: TranscriptChunk[] | null
    channel_id: string
  } | null
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function jitterDelay(): number {
  return DELAY_MIN_MS + Math.floor(Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS))
}

async function generateDraft(
  candidate: CandidateRow,
  config: CommentReplyConfig,
  channelTitle: string,
  channelHandle: string | null,
): Promise<string | null> {
  const shouldIncludeCta = decideCta(config.cta_frequency)

  let parentReplyText: string | null = null
  if (candidate.parent_comment_id) {
    const { data: parent } = await supabaseAdmin
      .from('yt_comments')
      .select('text, is_owner_reply')
      .eq('yt_comment_id', candidate.parent_comment_id)
      .maybeSingle<{ text: string; is_owner_reply: boolean }>()
    if (parent?.is_owner_reply) parentReplyText = parent.text
  }

  const system = buildCommentReplySystemPrompt({
    channelTitle,
    channelHandle,
    tone: config.tone,
    telegramUrl: config.telegram_url,
    communityUrl: config.community_url,
    maxLength: config.max_reply_length,
    shouldIncludeCta,
  })
  const user = buildCommentReplyUserPrompt({
    videoTitle: candidate.video.current_title ?? '',
    videoDescription: candidate.video.current_description,
    transcript: candidate.video.transcript,
    transcriptChunks: candidate.video.transcript_chunks,
    commentText: candidate.text,
    commentAuthor: candidate.author_name,
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

  if (!draft) return null

  await supabaseAdmin
    .from('yt_comments')
    .update({
      ai_reply_draft: draft,
      ai_reply_model: AI_MODELS.claude,
      ai_reply_generated_at: new Date().toISOString(),
    })
    .eq('id', candidate.id)
  return draft
}

async function loadCandidates(channelId: string, limit: number): Promise<CandidateRow[]> {
  const { data } = await supabaseAdmin
    .from('yt_comments')
    .select(
      'id, yt_comment_id, text, author_name, parent_comment_id, ai_reply_draft, classification, skip_reason, is_owner_reply, status, published_at, yt_videos!inner(id, current_title, current_description, transcript, transcript_chunks, channel_id)',
    )
    .eq('status', 'new')
    .is('parent_comment_id', null)
    .is('skip_reason', null)
    .eq('is_owner_reply', false)
    .eq('yt_videos.channel_id', channelId)
    .order('published_at', { ascending: false })
    .limit(limit)

  const rows = (data as unknown as RawCandidate[] | null) ?? []
  return rows
    .filter((r) => r.yt_videos)
    .map((r) => ({
      id: r.id,
      yt_comment_id: r.yt_comment_id,
      text: r.text,
      author_name: r.author_name,
      parent_comment_id: r.parent_comment_id,
      ai_reply_draft: r.ai_reply_draft,
      classification: r.classification,
      skip_reason: r.skip_reason,
      is_owner_reply: r.is_owner_reply,
      status: r.status,
      published_at: r.published_at,
      video: {
        id: r.yt_videos!.id,
        current_title: r.yt_videos!.current_title,
        current_description: r.yt_videos!.current_description,
        transcript: r.yt_videos!.transcript,
        transcript_chunks: r.yt_videos!.transcript_chunks,
      },
    }))
}

export interface AutoReplyResult {
  channels: number
  attempted: number
  sent: number
  skipped: number
  failed: number
}

export async function runAutoReplyTick(): Promise<AutoReplyResult> {
  if (isAutoReplyGloballyDisabled()) {
    console.log('[auto-reply] kill switch active — skipping tick')
    return { channels: 0, attempted: 0, sent: 0, skipped: 0, failed: 0 }
  }

  const { data: channels } = await supabaseAdmin
    .from('yt_channels')
    .select('id, title, handle, rules, needs_reauth')
    .eq('is_active', true)
    .eq('needs_reauth', false)

  let attempted = 0
  let sent = 0
  let skipped = 0
  let failed = 0
  let channelCount = 0

  for (const ch of (channels ?? []) as ChannelRow[]) {
    const config: CommentReplyConfig = {
      ...DEFAULT_COMMENT_REPLY_CONFIG,
      ...(ch.rules?.comments ?? {}),
    }
    if (!config.auto_reply) continue
    channelCount += 1

    const candidates = await loadCandidates(ch.id, PER_RUN_LIMIT)
    if (candidates.length === 0) continue

    for (const c of candidates) {
      attempted += 1

      // Belt-and-suspenders: classify if missing — auto-mode never sends without it.
      if (!c.classification) {
        try {
          const cls = await classifyComment(c.id)
          if (!cls || cls.skip_reason) {
            skipped += 1
            continue
          }
          c.classification = cls
        } catch {
          failed += 1
          continue
        }
      }

      let draft = c.ai_reply_draft
      if (!draft) {
        try {
          draft = await generateDraft(c, config, ch.title, ch.handle)
        } catch (err) {
          console.error('[auto-reply] draft failed', c.id, err instanceof Error ? err.message : err)
          failed += 1
          continue
        }
      }
      if (!draft) {
        skipped += 1
        continue
      }

      try {
        await sendCommentReply({
          ytCommentId: c.yt_comment_id,
          videoId: c.video.id,
          text: draft,
          mode: 'auto',
        })
        sent += 1
      } catch (err) {
        if (err instanceof ReplyError && err.status === 429) {
          // Daily/thread limit — stop processing this channel for this tick.
          console.log(`[auto-reply] limit hit for channel ${ch.id}: ${err.message}`)
          break
        }
        console.error(
          '[auto-reply] send failed',
          c.id,
          err instanceof Error ? err.message : err,
        )
        failed += 1
        continue
      }

      // Human-like spread between sends within the same channel.
      await sleep(jitterDelay())
    }
  }

  console.log(
    `[auto-reply] tick done: channels=${channelCount} attempted=${attempted} sent=${sent} skipped=${skipped} failed=${failed}`,
  )
  return { channels: channelCount, attempted, sent, skipped, failed }
}
