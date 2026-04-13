import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { createEmailMessage } from '@/lib/unisender'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  try {
    const { data: issue, error } = await supabaseAdmin
      .from('nl_issues')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !issue) {
      return NextResponse.json({ error: 'Выпуск не найден' }, { status: 404 })
    }

    if (!issue.subject?.trim()) {
      return NextResponse.json({ error: 'Укажите тему письма' }, { status: 400 })
    }
    if (!issue.body_html?.trim()) {
      return NextResponse.json({ error: 'Письмо пустое' }, { status: 400 })
    }

    const messageId = await createEmailMessage({
      senderName: process.env.UNISENDER_SENDER_NAME ?? 'Денис Царюк',
      senderEmail: process.env.UNISENDER_SENDER_EMAIL ?? 'denis@tsaryuk.ru',
      subject: issue.subject,
      bodyHtml: issue.body_html,
    })

    // Create or update campaign record
    const { data: existing } = await supabaseAdmin
      .from('nl_campaigns')
      .select('id')
      .eq('issue_id', id)
      .single()

    if (existing) {
      await supabaseAdmin
        .from('nl_campaigns')
        .update({
          unisender_message_id: messageId,
          status: 'created',
          error: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    } else {
      await supabaseAdmin
        .from('nl_campaigns')
        .insert({
          issue_id: id,
          unisender_message_id: messageId,
          list_id: parseInt(process.env.UNISENDER_LIST_ID ?? '0', 10),
          status: 'created',
        })
    }

    await supabaseAdmin
      .from('nl_issues')
      .update({ status: 'uploaded', updated_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json({ message_id: messageId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
