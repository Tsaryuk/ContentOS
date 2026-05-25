// PATCH a single comment_reply_log row — used by Reply Coach to record
// 👍/👎 feedback. Only the `feedback` column is writable; everything
// else (reply_text, status, yt_reply_id) is immutable after send.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

const ALLOWED_FEEDBACK = new Set(['good', 'bad', 'neutral'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  const body = await req.json().catch(() => ({}))
  const feedback: string | null =
    body.feedback === null
      ? null
      : typeof body.feedback === 'string' && ALLOWED_FEEDBACK.has(body.feedback)
        ? body.feedback
        : null

  // Allow nulling feedback (toggle off) by sending an empty string.
  // Otherwise only one of the allowed values flips through.
  if (body.feedback !== null && body.feedback !== '' && !feedback) {
    return NextResponse.json({ error: 'Недопустимый feedback' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('comment_reply_log')
    .update({ feedback })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
