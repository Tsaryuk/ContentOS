import { NextRequest, NextResponse } from 'next/server'
import { getQueue } from '@/lib/queue'
import { updateVideoStatus, getVideoWithChannel } from '@/lib/process/helpers'

export async function POST(req: NextRequest) {
  try {
    const { videoId } = await req.json()
    if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 })

    const { video } = await getVideoWithChannel(videoId)

    if (!video.transcript) {
      return NextResponse.json({ error: 'No transcript' }, { status: 400 })
    }
    if (video.status !== 'generating' && video.status !== 'error') {
      return NextResponse.json({ error: `Cannot generate: status "${video.status}"` }, { status: 400 })
    }

    await updateVideoStatus(videoId, 'generating')
    await getQueue().add('generate', { videoId }, { attempts: 1 })


    return NextResponse.json({ success: true, status: 'queued' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
