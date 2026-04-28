// Shared "send a YouTube reply" path used by both the API route and the
// auto-reply cron. Centralises kill switch, dedup, daily_limit, thread_depth
// and writes to comment_reply_log so we have a single source of truth.

import { supabaseAdmin } from '@/lib/supabase'
import { getYouTubeToken } from '@/lib/youtube/auth'
import {
  DEFAULT_COMMENT_REPLY_CONFIG,
  type CommentReplyConfig,
} from '@/lib/youtube/comment-reply-prompts'

export type ReplyMode = 'manual' | 'auto'

export interface SendReplyInput {
  ytCommentId: string  // parent comment yt_comment_id (the one we reply to)
  videoId: string      // yt_videos.id
  text: string
  mode: ReplyMode
}

export interface SendReplyResult {
  success: boolean
  replyId?: string
  status: number
  error?: string
}

interface CommentRow {
  id: string
  yt_comment_id: string
  parent_comment_id: string | null
  ai_reply_yt_id: string | null
}

interface VideoRow {
  id: string
  channel_id: string
}

interface ChannelRow {
  id: string
  rules: { comments?: Partial<CommentReplyConfig> } | null
}

export class ReplyError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function isAutoReplyGloballyDisabled(): boolean {
  return process.env.COMMENTS_AUTO_REPLY_GLOBAL_DISABLE === 'true'
}

function resolveConfig(rules: ChannelRow['rules']): CommentReplyConfig {
  return { ...DEFAULT_COMMENT_REPLY_CONFIG, ...(rules?.comments ?? {}) }
}

async function rollingDailyCount(channelId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabaseAdmin
    .from('comment_reply_log')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', channelId)
    .eq('status', 'sent')
    .gte('created_at', since)
  return count ?? 0
}

async function threadSentCount(channelId: string, rootYtId: string): Promise<number> {
  const { data: threadComments } = await supabaseAdmin
    .from('yt_comments')
    .select('id')
    .or(`yt_comment_id.eq.${rootYtId},parent_comment_id.eq.${rootYtId}`)
  const ids = (threadComments ?? []).map((c) => c.id)
  if (ids.length === 0) return 0
  const { count } = await supabaseAdmin
    .from('comment_reply_log')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', channelId)
    .eq('status', 'sent')
    .in('comment_id', ids)
  return count ?? 0
}

export async function sendCommentReply(input: SendReplyInput): Promise<SendReplyResult> {
  if (isAutoReplyGloballyDisabled()) {
    throw new ReplyError(503, 'Comment replies temporarily disabled by operator.')
  }

  const { data: video } = await supabaseAdmin
    .from('yt_videos')
    .select('id, channel_id')
    .eq('id', input.videoId)
    .maybeSingle<VideoRow>()
  if (!video) throw new ReplyError(404, 'Video not found')

  const { data: parentComment } = await supabaseAdmin
    .from('yt_comments')
    .select('id, yt_comment_id, parent_comment_id, ai_reply_yt_id')
    .eq('yt_comment_id', input.ytCommentId)
    .maybeSingle<CommentRow>()
  if (!parentComment) throw new ReplyError(404, 'Comment not found in DB')

  if (parentComment.ai_reply_yt_id) {
    throw new ReplyError(409, 'Already replied to this comment')
  }

  const { data: existingLog } = await supabaseAdmin
    .from('comment_reply_log')
    .select('id')
    .eq('comment_id', parentComment.id)
    .eq('status', 'sent')
    .limit(1)
    .maybeSingle<{ id: string }>()
  if (existingLog) {
    throw new ReplyError(409, 'Already replied to this comment')
  }

  const { data: channel } = await supabaseAdmin
    .from('yt_channels')
    .select('id, rules')
    .eq('id', video.channel_id)
    .maybeSingle<ChannelRow>()
  const config = resolveConfig(channel?.rules ?? null)

  // daily_limit === 0 means "no cap" — skip the check entirely.
  if (config.daily_limit > 0) {
    const dailyCount = await rollingDailyCount(video.channel_id)
    if (dailyCount >= config.daily_limit) {
      throw new ReplyError(429, `Daily reply limit reached (${config.daily_limit}/24h)`)
    }
  }

  // Thread depth — count all "sent" rows in the same root-thread.
  if (parentComment.parent_comment_id) {
    const { data: rootChain } = await supabaseAdmin
      .from('yt_comments')
      .select('yt_comment_id, parent_comment_id')
      .eq('yt_comment_id', parentComment.parent_comment_id)
      .maybeSingle<{ yt_comment_id: string; parent_comment_id: string | null }>()
    const rootYtId = rootChain?.parent_comment_id ?? rootChain?.yt_comment_id ?? null
    if (rootYtId && config.thread_depth < 2) {
      const sentInThread = await threadSentCount(video.channel_id, rootYtId)
      if (sentInThread > config.thread_depth) {
        throw new ReplyError(429, `Thread depth limit reached (${config.thread_depth})`)
      }
    }
  }

  let token: string
  try {
    token = await getYouTubeToken({ id: video.channel_id })
  } catch (err) {
    throw err
  }

  const res = await fetch('https://www.googleapis.com/youtube/v3/comments?part=snippet', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      snippet: { parentId: input.ytCommentId, textOriginal: input.text },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    const errMsg = `YouTube reply failed: ${res.status} ${errText.slice(0, 200)}`
    await supabaseAdmin.from('comment_reply_log').insert({
      channel_id: video.channel_id,
      comment_id: parentComment.id,
      reply_text: input.text,
      mode: input.mode,
      status: 'failed',
      error: errMsg,
    })
    throw new ReplyError(res.status, errMsg)
  }

  const reply = await res.json()
  const nowIso = new Date().toISOString()

  await supabaseAdmin.from('yt_comments').upsert(
    {
      video_id: input.videoId,
      yt_comment_id: reply.id,
      parent_comment_id: input.ytCommentId,
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

  await supabaseAdmin
    .from('yt_comments')
    .update({ status: 'replied', ai_reply_sent_at: nowIso, ai_reply_yt_id: reply.id })
    .eq('id', parentComment.id)

  await supabaseAdmin.from('comment_reply_log').insert({
    channel_id: video.channel_id,
    comment_id: parentComment.id,
    reply_text: input.text,
    mode: input.mode,
    status: 'sent',
    yt_reply_id: reply.id,
  })

  return { success: true, replyId: reply.id, status: 200 }
}
