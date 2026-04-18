import { NextRequest, NextResponse } from 'next/server'
import { updateVideoStatus, getVideoWithChannel } from '@/lib/process/helpers'
import { requireAuth } from '@/lib/auth'
import { enqueueProcessJob } from '@/lib/process/enqueue'
import { handleApiError } from '@/lib/api-error'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

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
    const { status } = await enqueueProcessJob('generate', videoId, { videoId })

    return NextResponse.json({ success: true, status })
  } catch (err: unknown) {
    return handleApiError(err, { route: '/api/process/generate', userId: auth.userId })
  }
}
