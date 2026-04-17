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

    const allowedStatuses = ['pending', 'review', 'error', 'generating', 'producing', 'done']
    if (!allowedStatuses.includes(video.status)) {
      return NextResponse.json({ error: `Cannot produce: status "${video.status}"` }, { status: 400 })
    }

    await updateVideoStatus(videoId, 'producing')
    const queue = getQueue()
    const jobId = `produce:${videoId}`
    const existing = await queue.getJob(jobId)
    if (existing && ['active', 'waiting', 'delayed'].includes(await existing.getState())) {
      return NextResponse.json({ success: true, status: 'already_queued' })
    }
    await queue.add('produce', { videoId }, { jobId, attempts: 1 })

    return NextResponse.json({ success: true, status: 'queued' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
