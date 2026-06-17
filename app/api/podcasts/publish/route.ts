import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { enqueueProcessJob } from '@/lib/process/enqueue'
import { publishReadyForShow } from '@/lib/podcasts/auto-publish'
import { handleApiError } from '@/lib/api-error'

// Manually publish podcast episodes. The heavy work (audio extraction + upload
// + episode insert) runs in the worker via the `podcast_publish` job; this
// route only validates and enqueues.
//
// Body: { showId } — publish all ready (done, no episode yet) videos of a show,
//        or { videoId } — publish one specific finished podcast video.
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { showId, videoId } = await req.json()

    if (showId && typeof showId === 'string') {
      const r = await publishReadyForShow(showId)
      return NextResponse.json({ success: true, ...r })
    }

    if (videoId && typeof videoId === 'string') {
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
    }

    return NextResponse.json({ error: 'showId или videoId обязателен' }, { status: 400 })
  } catch (err: unknown) {
    return handleApiError(err, { route: '/api/podcasts/publish', userId: auth.userId })
  }
}
