import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

interface QueueComment {
  id: string
  yt_comment_id: string
  text: string
  author_name: string
  author_avatar: string | null
  published_at: string | null
  like_count: number
  parent_comment_id: string | null
  ai_reply_draft: string | null
  classification: Record<string, unknown> | null
  kind: 'top_level' | 'reply_to_us'
  parent_reply_text: string | null
  video: {
    id: string
    yt_video_id: string
    title: string | null
    thumbnail: string | null
  }
}

interface CommentRow {
  id: string
  yt_comment_id: string
  text: string
  author_name: string
  author_avatar: string | null
  published_at: string | null
  like_count: number
  parent_comment_id: string | null
  ai_reply_draft: string | null
  classification: Record<string, unknown> | null
  is_owner_reply: boolean
  status: string
  skip_reason: string | null
  yt_videos: {
    id: string
    yt_video_id: string
    current_title: string | null
    current_thumbnail: string | null
    thumbnail_url: string | null
    channel_id: string
  } | null
}

// GET /api/comments/queue?platform=youtube&channelId=&limit=20
// Returns top-level "new" comments + (when thread_depth >= 1) replies to our previous replies.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const platform = req.nextUrl.searchParams.get('platform') ?? 'youtube'
  if (platform !== 'youtube') {
    return NextResponse.json({ error: 'Only youtube is supported on v1' }, { status: 400 })
  }

  const channelId = req.nextUrl.searchParams.get('channelId')
  if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 })

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '20', 10) || 20, 50)

  // Top-level pending.
  const { data: topLevelRaw, error: topErr } = await supabaseAdmin
    .from('yt_comments')
    .select(
      'id, yt_comment_id, text, author_name, author_avatar, published_at, like_count, parent_comment_id, ai_reply_draft, classification, is_owner_reply, status, skip_reason, yt_videos!inner(id, yt_video_id, current_title, current_thumbnail, thumbnail_url, channel_id)',
    )
    .is('parent_comment_id', null)
    .eq('status', 'new')
    .is('skip_reason', null)
    .eq('is_owner_reply', false)
    .eq('yt_videos.channel_id', channelId)
    .order('published_at', { ascending: false })
    .limit(limit)

  if (topErr) {
    return NextResponse.json({ error: topErr.message }, { status: 500 })
  }

  const topLevel: QueueComment[] = (topLevelRaw as unknown as CommentRow[] | null ?? []).map((row) =>
    toQueueItem(row, 'top_level', null),
  )

  // Replies to our published replies (single extra level).
  // ai_reply_yt_id on our parent comment row = the YouTube ID of the reply we sent.
  // A user's response to that has parent_comment_id = our ai_reply_yt_id.
  const { data: repliedParents } = await supabaseAdmin
    .from('yt_comments')
    .select('id, yt_comment_id, text, ai_reply_yt_id, video_id, yt_videos!inner(channel_id)')
    .eq('yt_videos.channel_id', channelId)
    .not('ai_reply_yt_id', 'is', null)
    .order('ai_reply_sent_at', { ascending: false })
    .limit(50)

  const ourReplyIds = (repliedParents ?? [])
    .map((r) => (r as unknown as { ai_reply_yt_id: string | null }).ai_reply_yt_id)
    .filter((x): x is string => Boolean(x))

  let threadReplies: QueueComment[] = []
  if (ourReplyIds.length > 0) {
    const { data: replyRows } = await supabaseAdmin
      .from('yt_comments')
      .select(
        'id, yt_comment_id, text, author_name, author_avatar, published_at, like_count, parent_comment_id, ai_reply_draft, classification, is_owner_reply, status, skip_reason, yt_videos!inner(id, yt_video_id, current_title, current_thumbnail, thumbnail_url, channel_id)',
      )
      .in('parent_comment_id', ourReplyIds)
      .eq('yt_videos.channel_id', channelId)
      .eq('is_owner_reply', false)
      .neq('status', 'replied')
      .is('skip_reason', null)
      .order('published_at', { ascending: false })
      .limit(limit)

    // Build lookup: our_reply_yt_id -> our reply text (the parent thread item we replied to had our text in ai_reply_draft / sent text).
    const parentMap = new Map<string, string>()
    for (const p of repliedParents ?? []) {
      const row = p as unknown as { yt_comment_id: string; ai_reply_yt_id: string | null; text: string }
      if (row.ai_reply_yt_id) parentMap.set(row.ai_reply_yt_id, row.text)
    }

    threadReplies = (replyRows as unknown as CommentRow[] | null ?? []).map((row) => {
      const parentText = row.parent_comment_id ? parentMap.get(row.parent_comment_id) ?? null : null
      return toQueueItem(row, 'reply_to_us', parentText)
    })
  }

  // Merge + sort by published_at desc, cap at limit.
  const merged = [...topLevel, ...threadReplies]
    .sort((a, b) => {
      const ad = a.published_at ? Date.parse(a.published_at) : 0
      const bd = b.published_at ? Date.parse(b.published_at) : 0
      return bd - ad
    })
    .slice(0, limit)

  return NextResponse.json({ comments: merged })
}

function toQueueItem(
  row: CommentRow,
  kind: 'top_level' | 'reply_to_us',
  parentReplyText: string | null,
): QueueComment {
  return {
    id: row.id,
    yt_comment_id: row.yt_comment_id,
    text: row.text,
    author_name: row.author_name,
    author_avatar: row.author_avatar,
    published_at: row.published_at,
    like_count: row.like_count ?? 0,
    parent_comment_id: row.parent_comment_id,
    ai_reply_draft: row.ai_reply_draft,
    classification: row.classification,
    kind,
    parent_reply_text: parentReplyText,
    video: {
      id: row.yt_videos?.id ?? '',
      yt_video_id: row.yt_videos?.yt_video_id ?? '',
      title: row.yt_videos?.current_title ?? null,
      thumbnail: row.yt_videos?.current_thumbnail ?? row.yt_videos?.thumbnail_url ?? null,
    },
  }
}
