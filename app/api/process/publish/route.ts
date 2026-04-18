import { NextRequest, NextResponse } from 'next/server'
import { updateVideoStatus, getVideoWithChannel } from '@/lib/process/helpers'
import { requireAuth } from '@/lib/auth'
import { enqueueProcessJob } from '@/lib/process/enqueue'

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
    // 'publishing' is intentionally allowed — if a previous request errored
    // after updating status but before enqueueing, the user must be able to
    // retry. enqueueProcessJob dedups at the queue level.
    if (!['review', 'error', 'done', 'publishing'].includes(video.status)) {
      return NextResponse.json({ error: `Cannot publish: status "${video.status}"` }, { status: 400 })
    }

    await updateVideoStatus(videoId, 'publishing')
    const { status } = await enqueueProcessJob(
      'publish',
      videoId,
      { videoId, overrides: { title, thumbnailUrl } },
      { attempts: 1, priority: 1 },
    )

    return NextResponse.json({ success: true, status })
  } catch (err: any) {
    console.error('[api/process/publish]', err?.message, err?.stack)
    return NextResponse.json({ error: err.message ?? 'Ошибка сервера' }, { status: 500 })
  }
}
