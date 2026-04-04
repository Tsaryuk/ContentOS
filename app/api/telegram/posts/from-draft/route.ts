import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * Create a TG post from an existing yt_social_drafts record.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { draft_id, channel_id } = await req.json()

    if (!draft_id || !channel_id) {
      return NextResponse.json(
        { error: 'Требуются draft_id и channel_id' },
        { status: 400 }
      )
    }

    // Get the social draft
    const { data: draft, error: draftErr } = await supabaseAdmin
      .from('yt_social_drafts')
      .select('*')
      .eq('id', draft_id)
      .eq('platform', 'telegram')
      .single()

    if (draftErr || !draft) {
      return NextResponse.json(
        { error: 'Telegram-драфт не найден' },
        { status: 404 }
      )
    }

    // Create TG post from draft
    const { data: post, error: postErr } = await supabaseAdmin
      .from('tg_posts')
      .insert({
        channel_id,
        video_id: draft.video_id,
        content: draft.content,
        status: 'draft',
        created_by: auth.userId,
      })
      .select('*, channel:tg_channels!channel_id(id, title, username)')
      .single()

    if (postErr) {
      return NextResponse.json({ error: postErr.message }, { status: 500 })
    }

    return NextResponse.json({ post })
  } catch {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
