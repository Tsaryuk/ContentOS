import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('id, email, name, role, is_active, created_at')
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ users: data })
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const { email, name, password, role } = await req.json()

    if (!email || !name || !password) {
      return NextResponse.json({ error: 'Email, имя и пароль обязательны' }, { status: 400 })
    }

    if (role && !['admin', 'manager'].includes(role)) {
      return NextResponse.json({ error: 'Роль должна быть admin или manager' }, { status: 400 })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    const { data, error } = await supabaseAdmin
      .from('users')
      .insert({
        email: email.toLowerCase().trim(),
        name: name.trim(),
        password_hash: passwordHash,
        role: role ?? 'manager',
      })
      .select('id, email, name, role, is_active, created_at')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Пользователь с таким email уже существует' }, { status: 400 })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ user: data })
  } catch {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
