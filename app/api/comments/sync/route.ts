import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { syncCommentsForVideo } from '@/lib/youtube/sync-comments'
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

    const result = await syncCommentsForVideo(video)
    return NextResponse.json({ success: true, count: result.count })
  } catch (err: unknown) {
    console.error('[comments/sync]', err instanceof Error ? err.message : err)
    return youtubeErrorResponse(err)
  }
}
