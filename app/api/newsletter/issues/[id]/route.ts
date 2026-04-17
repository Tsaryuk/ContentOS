import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

const ISSUE_ALLOWED_FIELDS = new Set([
  'title', 'subtitle', 'body_html', 'cover_url', 'campaign_id',
  'status', 'scheduled_at', 'sent_at', 'mail_template',
  'seo_title', 'seo_description',
])

function pickAllowed<T extends Record<string, unknown>>(
  body: T,
  allowed: Set<string>,
): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (allowed.has(key)) out[key] = body[key]
  }
  return out as Partial<T>
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('nl_issues')
    .select('*, campaign:nl_campaigns(*), ai_messages:nl_ai_messages(*)')
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Выпуск не найден' }, { status: 404 })
  }

  return NextResponse.json({ issue: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  try {
    const raw = await req.json()
    const update: Record<string, unknown> = pickAllowed(raw, ISSUE_ALLOWED_FIELDS)

    // Save version history before update (internal fields, not from user)
    if (update.body_html !== undefined) {
      const { data: current } = await supabaseAdmin
        .from('nl_issues')
        .select('body_html, version, versions_history')
        .eq('id', id)
        .single()

      if (current && current.body_html) {
        const history = (current.versions_history ?? []) as Array<Record<string, unknown>>
        history.push({
          version: current.version,
          body_html: current.body_html,
          saved_at: new Date().toISOString(),
        })
        // Keep last 10 versions
        const trimmed = history.slice(-10)
        update.versions_history = trimmed
        update.version = (current.version ?? 1) + 1
      }
    }

    update.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('nl_issues')
      .update(update)
      .eq('id', id)
      .select('*, campaign:nl_campaigns(*)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ issue: data })
  } catch {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  const { error } = await supabaseAdmin
    .from('nl_issues')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
