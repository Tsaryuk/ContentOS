import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getYouTubeToken } from '@/lib/youtube/auth'
import { youtubeErrorResponse } from '@/lib/youtube/errors'

// POST /api/comments/reply — reply to a YouTube comment
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { commentId, text, videoId } = await req.json()
    if (!commentId || !text || !videoId) {
      return NextResponse.json({ error: 'commentId, text, videoId required' }, { status: 400 })
    }

    // Get channel id from video
    const { data: video } = await supabaseAdmin
      .from('yt_videos')
      .select('channel_id')
      .eq('id', videoId)
      .single()

    if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

    const token = await getYouTubeToken({ id: video.channel_id })

    // Post reply via YouTube API
    const res = await fetch('https://www.googleapis.com/youtube/v3/comments?part=snippet', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        snippet: {
          parentId: commentId,
          textOriginal: text,
        },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`YouTube reply failed: ${res.status} ${errText.slice(0, 200)}`)
    }

    const reply = await res.json()

    // Save reply to DB
    await supabaseAdmin.from('yt_comments').upsert({
      video_id: videoId,
      yt_comment_id: reply.id,
      parent_comment_id: commentId,
      author_name: reply.snippet.authorDisplayName,
      author_channel_id: reply.snippet.authorChannelId?.value,
      author_avatar: reply.snippet.authorProfileImageUrl,
      text: reply.snippet.textDisplay,
      like_count: 0,
      reply_count: 0,
      published_at: reply.snippet.publishedAt,
      is_owner_reply: true,
      status: 'replied',
    }, { onConflict: 'yt_comment_id' })

    // Update parent comment status
    await supabaseAdmin
      .from('yt_comments')
      .update({ status: 'replied' })
      .eq('yt_comment_id', commentId)

    return NextResponse.json({ success: true, replyId: reply.id })
  } catch (err: unknown) {
    console.error('[comments/reply]', err instanceof Error ? err.message : err)
    return youtubeErrorResponse(err)
  }
}
