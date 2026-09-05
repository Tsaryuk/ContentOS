/**
 * POST /api/process/adopt — взять то, что уже опубликовано на YouTube, как
 * черновик для правки внутри ContentOS.
 *
 * Зачем отдельный путь. Синк тянет с YouTube current_title/description/tags,
 * но редактор правит generated_*, а публикация отказывается работать без
 * generated_title. Поэтому выпуск, оформленный руками на YouTube, невозможно
 * было просто поправить: приходилось гонять полный конвейер со скачиванием и
 * расшифровкой только ради того, чтобы получить текст в редакторе.
 *
 * Здесь ни скачивания, ни расшифровки, ни обращения к AI — только перенос
 * полей. Полный конвейер (`/api/process/produce`) остаётся отдельной кнопкой:
 * он нужен для умножения — таймкодов, клипов, шортсов, аудиоверсии, — и это
 * другая задача, а не накладной расход на правку метаданных.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getVideoWithChannel } from '@/lib/process/helpers'
import { supabaseAdmin } from '@/lib/supabase'
import { handleApiError } from '@/lib/api-error'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { videoId } = await req.json()
    if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 })

    const { video } = await getVideoWithChannel(videoId)

    if (!video.current_title) {
      return NextResponse.json(
        { error: 'На YouTube нет данных для переноса — сначала синхронизируйте канал' },
        { status: 400 },
      )
    }

    const { error } = await supabaseAdmin
      .from('yt_videos')
      .update({
        generated_title: video.current_title,
        generated_description: video.current_description ?? null,
        generated_tags: video.current_tags?.length ? video.current_tags : null,
        // Правка ещё не просмотрена человеком, поэтому одобрение сбрасываем:
        // handlePublish пускает в YouTube только is_approved.
        is_approved: false,
        status: 'review',
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId)

    if (error) throw error

    return NextResponse.json({ success: true, status: 'review' })
  } catch (err: unknown) {
    return handleApiError(err, { route: '/api/process/adopt', userId: auth.userId })
  }
}
