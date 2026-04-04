import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getQueue } from '@/lib/queue'

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const postId = params.id

  const { data: post } = await supabaseAdmin
    .from('tg_posts')
    .select('status')
    .eq('id', postId)
    .single()

  if (!post) {
    return NextResponse.json({ error: 'Пост не найден' }, { status: 404 })
  }
  if (post.status === 'sent') {
    return NextResponse.json({ error: 'Пост уже отправлен' }, { status: 400 })
  }
  if (post.status === 'sending') {
    return NextResponse.json({ error: 'Пост уже отправляется' }, { status: 400 })
  }

  // Update status to sending
  await supabaseAdmin
    .from('tg_posts')
    .update({ status: 'sending', updated_at: new Date().toISOString() })
    .eq('id', postId)

  // Queue immediate send
  await getQueue().add('telegram_send', { postId }, { attempts: 2 })

  return NextResponse.json({ success: true, status: 'sending' })
}
