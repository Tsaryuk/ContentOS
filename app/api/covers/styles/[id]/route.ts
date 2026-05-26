// PATCH /api/covers/styles/[id]  — partial update (admin only)
// DELETE /api/covers/styles/[id] — soft-remove via is_active=false. We never
//                                  hard-delete because cover_generations.style_id
//                                  FK is ON DELETE SET NULL but losing the row
//                                  also loses the prompts the generations were
//                                  produced from. Soft-delete keeps history
//                                  readable while hiding the style from pickers.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { styleUpdateSchema } from '@/lib/covers/schema'

export const dynamic = 'force-dynamic'

function isUuid(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 })

  let body
  try {
    body = styleUpdateSchema.parse(await req.json())
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message ?? 'Bad input' : 'Bad JSON'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('cover_styles')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', params.id)
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `Slug уже занят` }, { status: 409 })
    }
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Стиль не найден' }, { status: 404 })
    }
    console.error('[covers] styles PATCH:', error.message)
    return NextResponse.json({ error: 'Не удалось обновить стиль' }, { status: 500 })
  }

  return NextResponse.json({ style: data })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  if (!isUuid(params.id)) return NextResponse.json({ error: 'Bad id' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('cover_styles')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) {
    console.error('[covers] styles DELETE:', error.message)
    return NextResponse.json({ error: 'Не удалось удалить стиль' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
