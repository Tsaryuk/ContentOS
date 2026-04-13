import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

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
    const body = await req.json()

    // Save version history before update
    if (body.body_html !== undefined) {
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
        body.versions_history = trimmed
        body.version = (current.version ?? 1) + 1
      }
    }

    body.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('nl_issues')
      .update(body)
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
