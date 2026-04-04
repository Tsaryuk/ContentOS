import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const url = req.nextUrl.searchParams
  const status = url.get('status')
  const channelId = url.get('channel_id')

  const session = await getSession()
  const projectId = session.activeProjectId

  let query = supabaseAdmin
    .from('tg_posts')
    .select('*, channel:tg_channels!channel_id(id, title, username)')

  if (status) query = query.eq('status', status)
  if (channelId) query = query.eq('channel_id', channelId)

  // Filter by project through channel
  if (projectId) {
    const { data: channels } = await supabaseAdmin
      .from('tg_channels')
      .select('id')
      .eq('project_id', projectId)

    const channelIds = (channels ?? []).map(c => c.id)
    if (channelIds.length > 0) {
      query = query.in('channel_id', channelIds)
    } else {
      return NextResponse.json({ posts: [] })
    }
  }

  query = query.order('created_at', { ascending: false })

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ posts: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json()

    if (!body.channel_id) {
      return NextResponse.json({ error: 'Выберите канал' }, { status: 400 })
    }
    if (!body.content?.trim()) {
      return NextResponse.json({ error: 'Текст поста обязателен' }, { status: 400 })
    }

    const insert = {
      channel_id: body.channel_id,
      video_id: body.video_id || null,
      content: body.content.trim(),
      media_urls: body.media_urls ?? [],
      status: body.scheduled_at ? 'scheduled' : 'draft',
      scheduled_at: body.scheduled_at || null,
      created_by: auth.userId,
    }

    const { data, error } = await supabaseAdmin
      .from('tg_posts')
      .insert(insert)
      .select('*, channel:tg_channels!channel_id(id, title, username)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // If scheduled, add to BullMQ delayed queue
    if (data.scheduled_at) {
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
