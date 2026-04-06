import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error('Failed to refresh token')
  return data.access_token
}

// POST /api/comments/reply — reply to a YouTube comment
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { commentId, text, videoId } = await req.json()
    if (!commentId || !text || !videoId) {
      return NextResponse.json({ error: 'commentId, text, videoId required' }, { status: 400 })
    }

    // Get channel refresh token
    const { data: video } = await supabaseAdmin
      .from('yt_videos')
      .select('channel_id')
      .eq('id', videoId)
      .single()

    if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

    const { data: channel } = await supabaseAdmin
      .from('yt_channels')
      .select('refresh_token, yt_channel_id')
      .eq('id', video.channel_id)
      .single()

    const refreshToken = channel?.refresh_token ?? process.env.YOUTUBE_REFRESH_TOKEN
    if (!refreshToken) return NextResponse.json({ error: 'No refresh token' }, { status: 400 })

    const token = await getAccessToken(refreshToken)

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
  } catch (err: any) {
    console.error('[comments/reply]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
