import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { enqueueProcessJob } from '@/lib/process/enqueue'
import { handleApiError } from '@/lib/api-error'

// Manually publish a finished podcast video as an episode. The heavy work
// (audio extraction + upload + episode insert) runs in the worker via the
// `podcast_publish` job; this route only validates and enqueues.
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { videoId } = await req.json()
    if (!videoId || typeof videoId !== 'string') {
      return NextResponse.json({ error: 'videoId required' }, { status: 400 })
    }

    const { data: video } = await supabaseAdmin
      .from('yt_videos')
      .select('id, content_type, status')
      .eq('id', videoId)
      .maybeSingle()

    if (!video) return NextResponse.json({ error: 'Видео не найдено' }, { status: 404 })
    if (video.content_type !== 'podcast') {
      return NextResponse.json({ error: 'Видео не помечено как подкаст' }, { status: 400 })
    }
    if (video.status !== 'done') {
      return NextResponse.json({ error: `Видео ещё не готово (статус: ${video.status})` }, { status: 400 })
    }

    const { status } = await enqueueProcessJob('podcast_publish', videoId, { videoId }, { attempts: 1 })
    return NextResponse.json({ success: true, status })
  } catch (err: unknown) {
    return handleApiError(err, { route: '/api/podcasts/publish', userId: auth.userId })
  }
}
