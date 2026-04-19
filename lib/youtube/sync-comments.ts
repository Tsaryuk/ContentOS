/**
 * Shared comment-sync logic used by both the per-video API route and the
 * daily cron that iterates recent videos.
 *
 * Comments API is quota-expensive (1 unit per page of 100, so 5 units per
 * video if we hit the 500-comment cap). To keep daily quota in budget we
 * only sync comments for videos published in the last 30 days — that's where
 * new comments actually land. Manual per-video sync via the API route still
 * works for older videos.
 */

import { supabaseAdmin } from '@/lib/supabase'
import { getYouTubeToken } from './auth'

const MAX_COMMENTS_PER_VIDEO = 500
const RECENT_DAYS = 30
const UPSERT_BATCH = 50

interface VideoRow {
  id: string
  yt_video_id: string
  channel_id: string
}

interface CommentThreadApiResponse {
  items?: Array<{
    snippet: {
      topLevelComment: { id: string; snippet: CommentSnippet }
      totalReplyCount?: number
    }
    replies?: { comments?: Array<{ id: string; snippet: CommentSnippet }> }
  }>
  nextPageToken?: string
}

interface CommentSnippet {
  authorDisplayName: string
  authorChannelId?: { value?: string }
  authorProfileImageUrl: string
  textDisplay: string
  likeCount?: number
  publishedAt: string
}

export interface SyncVideoCommentsResult {
  videoId: string
  count: number
}

export async function syncCommentsForVideo(video: VideoRow): Promise<SyncVideoCommentsResult> {
  const { data: channel } = await supabaseAdmin
    .from('yt_channels')
    .select('yt_channel_id')
    .eq('id', video.channel_id)
    .single<{ yt_channel_id: string }>()

  const token = await getYouTubeToken({ id: video.channel_id })

  const comments: Record<string, unknown>[] = []
  let nextPageToken: string | undefined

  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/commentThreads')
    url.searchParams.set('part', 'snippet,replies')
    url.searchParams.set('videoId', video.yt_video_id)
    url.searchParams.set('maxResults', '100')
    url.searchParams.set('order', 'time')
    if (nextPageToken) url.searchParams.set('pageToken', nextPageToken)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`YouTube API ${res.status}: ${errText.slice(0, 200)}`)
    }

    const data = (await res.json()) as CommentThreadApiResponse

    for (const thread of data.items ?? []) {
      const s = thread.snippet.topLevelComment.snippet
      comments.push({
        video_id: video.id,
        yt_comment_id: thread.snippet.topLevelComment.id,
        parent_comment_id: null,
        author_name: s.authorDisplayName,
        author_channel_id: s.authorChannelId?.value ?? null,
        author_avatar: s.authorProfileImageUrl,
        text: s.textDisplay,
        like_count: s.likeCount ?? 0,
        reply_count: thread.snippet.totalReplyCount ?? 0,
        published_at: s.publishedAt,
        is_owner_reply: s.authorChannelId?.value === channel?.yt_channel_id,
      })

      for (const reply of thread.replies?.comments ?? []) {
        const rs = reply.snippet
        comments.push({
          video_id: video.id,
          yt_comment_id: reply.id,
          parent_comment_id: thread.snippet.topLevelComment.id,
          author_name: rs.authorDisplayName,
          author_channel_id: rs.authorChannelId?.value ?? null,
          author_avatar: rs.authorProfileImageUrl,
          text: rs.textDisplay,
          like_count: rs.likeCount ?? 0,
          reply_count: 0,
          published_at: rs.publishedAt,
          is_owner_reply: rs.authorChannelId?.value === channel?.yt_channel_id,
        })
      }
    }

    nextPageToken = data.nextPageToken
  } while (nextPageToken && comments.length < MAX_COMMENTS_PER_VIDEO)

  if (comments.length > 0) {
    for (let i = 0; i < comments.length; i += UPSERT_BATCH) {
      await supabaseAdmin
        .from('yt_comments')
        .upsert(comments.slice(i, i + UPSERT_BATCH), {
          onConflict: 'yt_comment_id',
          ignoreDuplicates: false,
        })
    }
  }

  return { videoId: video.id, count: comments.length }
}

export interface SyncAllCommentsResult {
  videos: number
  comments: number
  failed: number
}

export async function syncRecentComments(): Promise<SyncAllCommentsResult> {
  const cutoff = new Date(Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Only pull videos whose channel has a usable refresh token — otherwise the
  // per-video getYouTubeToken call will throw and waste our iteration budget.
  const { data: videos } = await supabaseAdmin
    .from('yt_videos')
    .select('id, yt_video_id, channel_id, yt_channels!inner(refresh_token, needs_reauth)')
    .gte('published_at', cutoff)
    .eq('yt_channels.needs_reauth', false)
    .not('yt_channels.refresh_token', 'is', null)

  let totalComments = 0
  let failed = 0

  for (const v of (videos ?? []) as unknown as VideoRow[]) {
    try {
      const r = await syncCommentsForVideo(v)
      totalComments += r.count
    } catch (err) {
      failed += 1
      console.error(`[sync-comments] video ${v.id} failed:`, err instanceof Error ? err.message : err)
    }
  }

  console.log(`[sync-comments] synced ${totalComments} comments across ${videos?.length ?? 0} recent videos (failed=${failed})`)
  return { videos: videos?.length ?? 0, comments: totalComments, failed }
}
