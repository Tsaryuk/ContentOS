// PATCH (status / archive) + DELETE single idea.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { requireProjectAccess } from '@/lib/project-access'

const ALLOWED_STATUSES = new Set(['new', 'drafted', 'archived'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  const { data: scope } = await supabaseAdmin
    .from('nl_article_ideas').select('project_id').eq('id', id).single()
  if (!scope) return NextResponse.json({ error: 'Идея не найдена' }, { status: 404 })
  const denied = await requireProjectAccess(scope.project_id)
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.status === 'string' && ALLOWED_STATUSES.has(body.status)) {
    update.status = body.status
  }
  if (typeof body.raw_thought === 'string') {
    update.raw_thought = body.raw_thought.trim().slice(0, 2000)
  }

  const { data, error } = await supabaseAdmin
    .from('nl_article_ideas')
    .update(update).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ idea: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  const { data: scope } = await supabaseAdmin
    .from('nl_article_ideas').select('project_id').eq('id', id).single()
  if (!scope) return NextResponse.json({ error: 'Идея не найдена' }, { status: 404 })
  const denied = await requireProjectAccess(scope.project_id)
  if (denied) return denied

  const { error } = await supabaseAdmin.from('nl_article_ideas').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
