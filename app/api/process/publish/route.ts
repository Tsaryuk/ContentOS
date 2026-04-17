import { NextRequest, NextResponse } from 'next/server'
import { getQueue } from '@/lib/queue'
import { updateVideoStatus, getVideoWithChannel } from '@/lib/process/helpers'
import { requireAuth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { videoId, title, thumbnailUrl } = await req.json()
    if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 })

    const { video } = await getVideoWithChannel(videoId)

    if (!video.is_approved) {
      return NextResponse.json({ error: 'Video must be approved' }, { status: 403 })
    }
    if (!['review', 'error', 'done'].includes(video.status)) {
      return NextResponse.json({ error: `Cannot publish: status "${video.status}"` }, { status: 400 })
    }

    await updateVideoStatus(videoId, 'publishing')

    // BullMQ uses jobId as natural idempotency key — adding a job with the
    // same id while the previous one is queued/active/completed is a no-op.
    // Prevents double-publish when the UI fires the request twice (double
    // click, network retry).
    const queue = getQueue()
    const jobId = `publish:${videoId}`
    const existing = await queue.getJob(jobId)
    if (existing && ['active', 'waiting', 'delayed'].includes(await existing.getState())) {
      return NextResponse.json({ success: true, status: 'already_queued' })
    }
    await queue.add('publish', {
      videoId,
      overrides: { title, thumbnailUrl },
    }, { jobId, attempts: 1, priority: 1 })

    return NextResponse.json({ success: true, status: 'queued' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
