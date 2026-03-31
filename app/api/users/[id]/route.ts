import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = params
    const body = await req.json()
    const update: Record<string, unknown> = {}

    if (body.name !== undefined) update.name = body.name.trim()
    if (body.role !== undefined) {
      if (!['admin', 'manager'].includes(body.role)) {
        return NextResponse.json({ error: 'Роль должна быть admin или manager' }, { status: 400 })
      }
      update.role = body.role
    }
    if (body.is_active !== undefined) update.is_active = body.is_active
    if (body.password) {
      update.password_hash = await bcrypt.hash(body.password, 12)
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
    }

    update.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(update)
      .eq('id', id)
      .select('id, email, name, role, is_active, created_at')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ user: data })
  } catch {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = params

  if (id === auth.userId) {
    return NextResponse.json({ error: 'Нельзя деактивировать себя' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('users')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
