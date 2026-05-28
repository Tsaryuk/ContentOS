// /api/covers/styles
//   GET  — list active styles (optional ?target_kind=…).
//   POST — admin-only, create a new style row.
//
// PATCH/DELETE live in `./[id]/route.ts`.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { styleBodySchema } from '@/lib/covers/schema'

export const dynamic = 'force-dynamic'

interface CoverStyleResponse {
  id: string
  slug: string
  name: string
  description: string | null
  default_aspect: string
  variant_count: number
  target_kinds: string[]
  brand_palette: string[]
}

interface StyleRow {
  id: string
  slug: string
  name: string
  description: string | null
  default_aspect: string
  variants: Array<{ kind: string; label: string; prompt: string }> | null
  target_kinds: string[] | null
  brand_palette: string[] | null
  sort_order: number
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const url = new URL(req.url)
  const targetKind = url.searchParams.get('target_kind')
  // Admin-only: include inactive rows and the full prompt payload (variants,
  // scene_template, negative_prompt) so the CRUD UI has something to edit.
  const adminMode = url.searchParams.get('admin') === '1'
  if (adminMode && auth.userRole !== 'admin') {
    return NextResponse.json({ error: 'Только админ' }, { status: 403 })
  }

  let query = supabaseAdmin
    .from('cover_styles')
    .select(
      adminMode
        ? 'id, slug, name, description, scene_template, variants, negative_prompt, model, default_aspect, brand_palette, target_kinds, is_active, sort_order'
        : 'id, slug, name, description, default_aspect, variants, target_kinds, brand_palette, sort_order',
    )
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (!adminMode) query = query.eq('is_active', true)

  const { data, error } = await query

  if (error) {
    console.error('[covers] styles list:', error.message)
    return NextResponse.json({ error: 'Не удалось получить список стилей' }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as StyleRow[]
  // Filter by target_kind in app code: empty target_kinds == universal.
  const filtered = targetKind
    ? rows.filter((r) => !r.target_kinds || r.target_kinds.length === 0 || r.target_kinds.includes(targetKind))
    : rows

  if (adminMode) {
    return NextResponse.json({ styles: filtered })
  }

  const styles: CoverStyleResponse[] = filtered.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    default_aspect: r.default_aspect,
    variant_count: Array.isArray(r.variants) ? r.variants.length : 0,
    target_kinds: r.target_kinds ?? [],
    brand_palette: r.brand_palette ?? [],
  }))

  return NextResponse.json({ styles })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  let body: z.infer<typeof styleBodySchema>
  try {
    body = styleBodySchema.parse(await req.json())
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message ?? 'Bad input' : 'Bad JSON'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('cover_styles')
    .insert(body)
    .select('id, slug, name')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `Стиль со slug "${body.slug}" уже существует` }, { status: 409 })
    }
    console.error('[covers] styles POST:', error.message)
    return NextResponse.json({ error: 'Не удалось создать стиль' }, { status: 500 })
  }

  return NextResponse.json({ style: data })
}
