import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getYouTubeToken } from '@/lib/youtube/auth'
import { youtubeErrorResponse } from '@/lib/youtube/errors'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { videoId } = await req.json()
    if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 })

    const { data: video } = await supabaseAdmin
      .from('yt_videos')
      .select('id, yt_video_id, channel_id')
      .eq('id', videoId)
      .single()

    if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

    const { data: channel } = await supabaseAdmin
      .from('yt_channels')
      .select('yt_channel_id')
      .eq('id', video.channel_id)
      .single()

    const token = await getYouTubeToken({ id: video.channel_id })

    // Fetch comment threads from YouTube
    let comments: any[] = []
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

      const data = await res.json()

      for (const thread of data.items ?? []) {
        const s = thread.snippet.topLevelComment.snippet
        comments.push({
          video_id: video.id,
          yt_comment_id: thread.snippet.topLevelComment.id,
          parent_comment_id: null,
          author_name: s.authorDisplayName,
          author_channel_id: s.authorChannelId?.value,
          author_avatar: s.authorProfileImageUrl,
          text: s.textDisplay,
          like_count: s.likeCount ?? 0,
          reply_count: thread.snippet.totalReplyCount ?? 0,
          published_at: s.publishedAt,
          is_owner_reply: s.authorChannelId?.value === channel?.yt_channel_id,
        })

        // Add replies
        for (const reply of thread.replies?.comments ?? []) {
          const rs = reply.snippet
          comments.push({
            video_id: video.id,
            yt_comment_id: reply.id,
            parent_comment_id: thread.snippet.topLevelComment.id,
            author_name: rs.authorDisplayName,
            author_channel_id: rs.authorChannelId?.value,
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
    } while (nextPageToken && comments.length < 500) // cap at 500

    // Bulk upsert
    if (comments.length > 0) {
      const BATCH = 50
      for (let i = 0; i < comments.length; i += BATCH) {
        await supabaseAdmin
          .from('yt_comments')
          .upsert(comments.slice(i, i + BATCH), { onConflict: 'yt_comment_id', ignoreDuplicates: false })
      }
    }

    return NextResponse.json({ success: true, count: comments.length })
  } catch (err: unknown) {
    console.error('[comments/sync]', err instanceof Error ? err.message : err)
    return youtubeErrorResponse(err)
  }
}
