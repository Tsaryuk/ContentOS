import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getQueue } from '@/lib/queue'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { videoId } = await req.json()
    if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 })

    const { data: video } = await supabaseAdmin
      .from('yt_videos')
      .select('id, transcript, transcript_chunks, current_title, duration_seconds, producer_output, channel_id')
      .eq('id', videoId)
      .single()

    if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    if (!video.transcript) return NextResponse.json({ error: 'No transcript. Run transcription first.' }, { status: 400 })

    // Queue the analysis job
    await getQueue().add('analyze_clips', { videoId }, { attempts: 1 })

    return NextResponse.json({ success: true, status: 'queued' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
