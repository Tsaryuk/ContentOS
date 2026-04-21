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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  const body = await req.json().catch(() => ({}))
  const update: Record<string, string> = {}

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

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('projects')
    .update(update)
    .eq('id', id)
    .select('id, name, color, slug')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Проект не найден' }, { status: 404 })
  return NextResponse.json(data)
}
