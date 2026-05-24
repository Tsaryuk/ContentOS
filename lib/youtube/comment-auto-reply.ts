// Cron-driven auto-reply runner. Picks N candidates from the queue for
// channels with rules.comments.auto_reply=true, generates the draft (if
// missing) NOW, and enqueues each send as a separate BullMQ job with a
// staggered delay (5-20 min jitter per channel by default).
//
// Why enqueue instead of sleep-in-place: previously this function held
// onto a worker concurrency slot for up to 100 minutes while it slept
// between sends. With 4 total slots and several channels that
// effectively blocked the worker from processing transcription /
// publish / anything else. Decoupling the prepare-vs-send paths gives
// up that slot the moment drafts are ready.

import { Queue } from 'bullmq'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { AI_MODELS } from '@/lib/ai-models'
import { getRedisConnection } from '@/lib/queue'
import {
  DEFAULT_COMMENT_REPLY_CONFIG,
  buildCommentReplySystemPrompt,
  buildCommentReplyUserPrompt,
  decideCta,
  type CommentReplyConfig,
  type TranscriptChunk,
} from '@/lib/youtube/comment-reply-prompts'
import { isAutoReplyGloballyDisabled } from '@/lib/youtube/comment-reply-engine'
import { classifyComment } from '@/lib/youtube/comment-classifier'
import { pickContextChunks } from '@/lib/youtube/transcript-rag'
import { loadRecentReplyExamples } from '@/lib/youtube/recent-reply-examples'
import { loadCtaTargets } from '@/lib/youtube/cta-targets'

const anthropic = new Anthropic()

// Defaults used when channel.rules.comments doesn't override them. The
// previous constants stay here as the floor so a missing/zero value in
// the DB still produces sane behaviour.
const DEFAULT_PER_RUN_LIMIT = 5
const DEFAULT_DELAY_MIN_MS = 5 * 60 * 1000
const DEFAULT_DELAY_MAX_MS = 20 * 60 * 1000

// Sends are routed through this queue. The worker has a matching
// `comment_send_reply` handler (see worker.ts handlers map). Lazy-init
// keeps test environments without Redis happy.
let _sendQueue: Queue | null = null
function sendQueue(): Queue {
  if (!_sendQueue) {
    _sendQueue = new Queue('contentos', { connection: getRedisConnection() })
  }
  return _sendQueue
}

export interface CommentSendJob {
  ytCommentId: string
  videoId: string
  text: string
  channelId: string
}

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

/**
 * Compute the cumulative delay (in ms) for the Nth scheduled send within
 * a channel's batch. Each send picks a fresh random offset in
 * [delayMin, delayMax], so the gap between consecutive sends is jittered
 * but the total spread grows monotonically.
 *
 *   0th send: 0
 *   1st: random(min, max)
 *   2nd: 1st's window + another random(min, max)
 *   ...
 *
 * This keeps the "human-like spread" semantics of the previous inline
 * sleep loop, just with BullMQ doing the waiting instead of the worker
 * thread.
 */
function perChannelDelay(index: number, delayMin: number, delayMax: number): number {
  let total = 0
  for (let i = 0; i < index; i++) {
    const lo = Math.max(0, Math.min(delayMin, delayMax))
    const hi = Math.max(lo, delayMax)
    total += lo + Math.floor(Math.random() * (hi - lo))
  }
  // First send (index=0): tiny delay so the BullMQ engine actually
  // schedules it as a job rather than tries to process immediately
  // back-to-back. Keeps the worker queue uniform.
  if (index === 0) return 1_000
  return total
}

async function generateDraft(
  candidate: CandidateRow,
  config: CommentReplyConfig,
  channelId: string,
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

  const [examples, ctaProjects] = await Promise.all([
    loadRecentReplyExamples(channelId, 5),
    loadCtaTargets(config.cta_project_ids ?? []),
  ])
  const system = buildCommentReplySystemPrompt({
    channelTitle,
    channelHandle,
    tone: config.tone,
    telegramUrl: config.telegram_url,
    communityUrl: config.community_url,
    maxLength: config.max_reply_length,
    shouldIncludeCta,
    examples,
    ctaProjects,
  })
  const ragChunks = await pickContextChunks(
    candidate.video.id,
    candidate.video.transcript,
    candidate.text,
    candidate.video.transcript_chunks,
  )

  const user = buildCommentReplyUserPrompt({
    videoTitle: candidate.video.current_title ?? '',
    videoDescription: candidate.video.current_description,
    transcript: ragChunks ? null : candidate.video.transcript,
    transcriptChunks: ragChunks ?? candidate.video.transcript_chunks,
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

    // Per-channel limits with sane fallbacks. A 0 or missing field
    // collapses back to the default rather than disabling sends entirely.
    const perRun = config.per_run_limit > 0 ? config.per_run_limit : DEFAULT_PER_RUN_LIMIT
    const delayMin = config.delay_min_ms > 0 ? config.delay_min_ms : DEFAULT_DELAY_MIN_MS
    const delayMax = config.delay_max_ms > 0 ? config.delay_max_ms : DEFAULT_DELAY_MAX_MS

    const candidates = await loadCandidates(ch.id, perRun)
    if (candidates.length === 0) continue

    // Counter per channel: each scheduled send gets stacked on top of
    // the previous one's delay window so the human-spread is preserved
    // across the channel's batch.
    let channelSendsScheduled = 0
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
          draft = await generateDraft(c, config, ch.id, ch.title, ch.handle)
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

      // Enqueue the send as a delayed job. Each subsequent send within
      // this channel gets a cumulative delay so the spread is preserved,
      // but unlike before this runner returns immediately and frees its
      // worker slot. The worker's `comment_send_reply` handler then runs
      // sendCommentReply with whatever delay each job was scheduled for.
      try {
        const delayMs = perChannelDelay(channelSendsScheduled, delayMin, delayMax)
        await sendQueue().add(
          'comment_send_reply',
          {
            ytCommentId: c.yt_comment_id,
            videoId: c.video.id,
            text: draft,
            channelId: ch.id,
          } satisfies CommentSendJob,
          {
            delay: delayMs,
            jobId: `auto_reply:${c.id}`,
            removeOnComplete: true,
            removeOnFail: { count: 100 },
            attempts: 1, // ReplyError 429/409 isn't retryable; engine logs failure
          },
        )
        channelSendsScheduled += 1
        sent += 1
      } catch (err) {
        console.error(
          '[auto-reply] enqueue failed',
          c.id,
          err instanceof Error ? err.message : err,
        )
        failed += 1
        continue
      }
    }
  }

  console.log(
    `[auto-reply] tick done: channels=${channelCount} attempted=${attempted} sent=${sent} skipped=${skipped} failed=${failed}`,
  )
  return { channels: channelCount, attempted, sent, skipped, failed }
}
