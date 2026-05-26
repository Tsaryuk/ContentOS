// GET /api/covers/styles?target_kind=article
// Lists active cover styles, optionally filtered by target_kind.
//
// Admin CRUD (POST/PATCH/DELETE) lives in PR-3 — this endpoint is read-only
// for now so the UI can render the style picker.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

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

  const { data, error } = await supabaseAdmin
    .from('cover_styles')
    .select('id, slug, name, description, default_aspect, variants, target_kinds, brand_palette, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    console.error('[covers] styles list:', error.message)
    return NextResponse.json({ error: 'Не удалось получить список стилей' }, { status: 500 })
  }

  const rows = (data ?? []) as StyleRow[]
  // Filter by target_kind in app code: empty target_kinds == universal.
  const filtered = targetKind
    ? rows.filter((r) => !r.target_kinds || r.target_kinds.length === 0 || r.target_kinds.includes(targetKind))
    : rows

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
