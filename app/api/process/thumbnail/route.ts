import { NextRequest, NextResponse } from 'next/server'
import { getQueue } from '@/lib/queue'
import { updateVideoStatus, getVideoWithChannel } from '@/lib/process/helpers'
import { requireAuth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { videoId } = await req.json()
    if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 })

    const { video } = await getVideoWithChannel(videoId)

    if (!video.generated_title) {
      return NextResponse.json({ error: 'No generated title' }, { status: 400 })
    }
    if (video.status !== 'thumbnail' && video.status !== 'error') {
      return NextResponse.json({ error: `Cannot thumbnail: status "${video.status}"` }, { status: 400 })
    }

    await updateVideoStatus(videoId, 'thumbnail')
    await getQueue().add('thumbnail', { videoId }, { attempts: 1 })

    return NextResponse.json({ success: true, status: 'queued' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
