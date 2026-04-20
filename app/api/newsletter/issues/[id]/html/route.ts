// Returns the fully template-wrapped HTML of a newsletter issue as text/html.
// Used by the "Копировать HTML" button in the editor so the user can paste
// the real rendered email into Unisender (or any other ESP) by hand. The
// output is the same string that /upload sends to createEmailMessage.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { renderNewsletter } from '@/lib/newsletter/template'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  const { data: issue, error } = await supabaseAdmin
    .from('nl_issues')
    .select('subject, subtitle, tag, body_html')
    .eq('id', id)
    .single()

  if (error || !issue) {
    return NextResponse.json({ error: 'Выпуск не найден' }, { status: 404 })
  }

  const html = renderNewsletter({
    tag: issue.tag || 'Разговор о...',
    subject: issue.subject ?? '',
    subtitle: issue.subtitle ?? '',
    bodyHtml: issue.body_html ?? '',
  })

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  })
}
