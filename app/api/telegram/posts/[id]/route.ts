import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json()
    const postId = params.id

    // Only allow editing drafts and scheduled posts
    const { data: existing } = await supabaseAdmin
      .from('tg_posts')
      .select('status')
      .eq('id', postId)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Пост не найден' }, { status: 404 })
    }
    if (existing.status === 'sent' || existing.status === 'sending') {
      return NextResponse.json(
        { error: 'Нельзя редактировать отправленный пост' },
        { status: 400 }
      )
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.content !== undefined) update.content = body.content
    if (body.media_urls !== undefined) update.media_urls = body.media_urls
    if (body.scheduled_at !== undefined) {
      update.scheduled_at = body.scheduled_at
      update.status = body.scheduled_at ? 'scheduled' : 'draft'
    }

    const { data, error } = await supabaseAdmin
      .from('tg_posts')
      .update(update)
      .eq('id', postId)
      .select('*, channel:tg_channels!channel_id(id, title, username)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Re-schedule if needed
    if (data.status === 'scheduled' && data.scheduled_at) {
      const { getQueue } = await import('@/lib/queue')
      const delay = new Date(data.scheduled_at).getTime() - Date.now()
      if (delay > 0) {
        await getQueue().add('telegram_send', { postId: data.id }, { delay })
      }
    }

    return NextResponse.json({ post: data })
  } catch {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const postId = params.id

  const { data: existing } = await supabaseAdmin
    .from('tg_posts')
    .select('status')
    .eq('id', postId)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Пост не найден' }, { status: 404 })
  }
  if (existing.status === 'sent') {
    return NextResponse.json(
      { error: 'Нельзя удалить отправленный пост' },
      { status: 400 }
    )
  }

  const { error } = await supabaseAdmin
    .from('tg_posts')
    .delete()
    .eq('id', postId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
