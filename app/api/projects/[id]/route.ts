/**
 * PATCH /api/projects/[id] — rename / recolor an existing project (admin only).
 *
 * Accepts { name?, color? }. Slug is regenerated from the new name with a
 * numeric suffix fallback if the derived slug collides with another project.
 * We never fail the rename just because of a slug clash — slug is invisible
 * in the UI, so silently picking a unique variant beats a 500 with
 * "duplicate key value violates unique constraint".
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { buildUniqueProjectSlug } from '@/lib/projects/slug'
import { dbErrorResponse } from '@/lib/api-error'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  const body = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = {}

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'Название не может быть пустым' }, { status: 400 })
    update.name = name
    const slug = await buildUniqueProjectSlug(name, { excludeId: id })
    if (slug) update.slug = slug
  }
  if (typeof body.color === 'string' && /^#[0-9a-f]{6}$/i.test(body.color)) {
    update.color = body.color
  }

  // CTA fields — drive what the AI commenter knows about the project.
  // URL is the destination the AI will paste in a reply; description is
  // the one-sentence pitch the prompt shows; audience_keywords are topical
  // tags ("команда", "выгорание") the AI matches against the video/comment.
  if (typeof body.cta_url === 'string') {
    const trimmed = body.cta_url.trim()
    update.cta_url = trimmed === '' ? null : trimmed
  }
  if (typeof body.cta_description === 'string') {
    const trimmed = body.cta_description.trim()
    update.cta_description = trimmed === '' ? null : trimmed
  }
  if (Array.isArray(body.cta_audience_keywords)) {
    update.cta_audience_keywords = (body.cta_audience_keywords as unknown[])
      .filter((x): x is string => typeof x === 'string')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 20)
  }
  if (typeof body.cta_priority === 'number' && Number.isFinite(body.cta_priority)) {
    update.cta_priority = Math.max(0, Math.min(100, Math.floor(body.cta_priority)))
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('projects')
    .update(update)
    .eq('id', id)
    .select('id, name, color, slug, cta_url, cta_description, cta_audience_keywords, cta_priority')
    .single()

  if (error) return dbErrorResponse(error, '/api/projects/[id]')
  if (!data) return NextResponse.json({ error: 'Проект не найден' }, { status: 404 })
  return NextResponse.json(data)
}

// DELETE /api/projects/[id] — delete project (admin only; channels are detached
// by the client via /api/projects/assign before calling this).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('projects')
    .delete()
    .eq('id', id)

  if (error) return dbErrorResponse(error, '/api/projects/[id]')
  return NextResponse.json({ ok: true })
}
