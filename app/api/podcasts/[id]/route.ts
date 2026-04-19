/**
 * PATCH /api/podcasts/[id] — admin-only edit of a podcast show. Accepts a
 * whitelisted set of fields so mass-assignment can't poke at columns the
 * admin UI doesn't own (channel_id, created_at, etc.).
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

const EDITABLE_FIELDS = [
  'slug',
  'title',
  'description',
  'author',
  'owner_email',
  'owner_name',
  'language',
  'category',
  'subcategory',
  'cover_url',
  'cover_style_prompt',
  'explicit',
  'default_trim_start_sec',
  'default_trim_end_sec',
  'auto_publish',
  'is_active',
] as const

type EditableField = typeof EDITABLE_FIELDS[number]

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  const body = await req.json().catch(() => ({})) as Record<string, unknown>

  const update: Record<string, unknown> = {}
  for (const key of EDITABLE_FIELDS) {
    if (key in body) update[key] = body[key as EditableField]
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
  }

  if (typeof update.slug === 'string') {
    const slug = update.slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (!slug) return NextResponse.json({ error: 'Slug не может быть пустым' }, { status: 400 })
    update.slug = slug
  }
  if (typeof update.title === 'string' && update.title.trim() === '') {
    return NextResponse.json({ error: 'Название не может быть пустым' }, { status: 400 })
  }

  update.updated_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('podcast_shows')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Slug уже занят' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Шоу не найдено' }, { status: 404 })
  return NextResponse.json(data)
}
