// Pulls the author's recent successful comment replies for a channel and
// pairs each with the viewer comment it answered. Used as few-shot examples
// in the AI-draft system prompt so the model anchors on real voice rather
// than the abstract `rules.brand_voice` description alone.

import { supabaseAdmin } from '@/lib/supabase'
import type { ReplyExample } from './comment-reply-prompts'

interface LogRow {
  reply_text: string
  comment_id: string
  yt_comments: { text: string } | null
}

/**
 * Returns up to `limit` recent (channel, viewer-comment, author-reply)
 * examples. Filters out very short pairs ("спасибо" → "✌") that would
 * just teach the model to over-shorten.
 */
export async function loadRecentReplyExamples(
  channelId: string,
  limit = 5,
): Promise<ReplyExample[]> {
  // Pull more than `limit` and post-filter; supabase doesn't let us add a
  // length filter on a joined column in one go.
  const { data, error } = await supabaseAdmin
    .from('comment_reply_log')
    .select('reply_text, comment_id, yt_comments!inner(text)')
    .eq('channel_id', channelId)
    .eq('status', 'sent')
    .order('created_at', { ascending: false })
    .limit(limit * 4)

  if (error || !data) return []

  const rows = data as unknown as LogRow[]
  const seen = new Set<string>()
  const out: ReplyExample[] = []
  for (const row of rows) {
    const q = row.yt_comments?.text?.trim()
    const r = row.reply_text?.trim()
    if (!q || !r) continue
    // Skip ritual short pairs — they teach the model to under-respond.
    if (q.length < 20 || r.length < 30) continue
    // De-dupe near-identical pairs (same first 60 chars of question).
    const key = q.slice(0, 60)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ question: q, reply: r })
    if (out.length >= limit) break
  }
  return out
}
