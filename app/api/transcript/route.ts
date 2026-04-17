import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const videoId = req.nextUrl.searchParams.get('videoId')
  if (!videoId) {
    return NextResponse.json({ error: 'videoId required' }, { status: 400 })
  }

  const { data: video, error } = await supabaseAdmin
    .from('yt_videos')
    .select('current_title, transcript, transcript_chunks')
    .eq('id', videoId)
    .single()

  if (error || !video) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  }

  if (!video.transcript) {
    return NextResponse.json({ error: 'No transcript available' }, { status: 404 })
  }

  const format = req.nextUrl.searchParams.get('format') ?? 'json'

  if (format === 'txt') {
    const filename = `${video.current_title.replace(/[^a-zA-Zа-яА-Я0-9 ]/g, '').slice(0, 60)}.txt`
    return new NextResponse(video.transcript, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  return NextResponse.json({
    title: video.current_title,
    transcript: video.transcript,
    chunks: video.transcript_chunks,
    chunks_count: video.transcript_chunks?.length ?? 0,
  })
}
