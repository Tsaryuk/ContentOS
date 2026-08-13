import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getQueue } from '@/lib/queue'

// POST /api/youtube/regenerate-timecodes — regenerate timecodes only (no full produce)
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { videoId } = await req.json()
  if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 })

  // Pre-check: без транскрипта worker молча падает (guard стоит до try в
  // handleRegenerateTimecodes — джоб не логируется), а UI бесконечно поллит.
  // Отдаём явную ошибку сразу, чтобы пользователь понял, что делать.
  const { data: video } = await supabaseAdmin
    .from('yt_videos')
    .select('transcript')
    .eq('id', videoId)
    .single()

  if (!video) return NextResponse.json({ error: 'Видео не найдено' }, { status: 404 })
  if (!video.transcript) {
    return NextResponse.json(
      { error: 'Нет транскрипта — сначала расшифруйте видео (Produce)' },
      { status: 400 },
    )
  }

  const q = getQueue()
  await q.add('regenerate_timecodes', { videoId }, { attempts: 1 })
  return NextResponse.json({ ok: true })
}
