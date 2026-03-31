import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSession } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email и пароль обязательны' }, { status: 400 })
    }

    const { data: user, error } = await supabaseAdmin
      .from('users')
      .select('id, email, name, role, password_hash, is_active')
      .eq('email', email.toLowerCase().trim())
      .eq('is_active', true)
      .single()

    if (error || !user) {
      return NextResponse.json({ error: 'Неверный email или пароль' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Неверный email или пароль' }, { status: 401 })
    }

    const session = await getSession()
    session.userId = user.id
    session.userRole = user.role
    session.userName = user.name
    await session.save()

    return NextResponse.json({
      ok: true,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    })
  } catch {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
