import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSession } from '@/lib/session'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimit, clientIp, rateLimitResponse } from '@/lib/rate-limit'

// bcrypt-хэш произвольной строки — нужен, чтобы ветка "юзер не найден"
// выполняла полноценный bcrypt.compare и не отличалась по таймингу.
const DUMMY_HASH = '$2a$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW'

export async function POST(req: NextRequest) {
  // 10 login attempts per IP per minute. Brute-force protection.
  const rl = await rateLimit('login', clientIp(req), 10, 60)
  if (!rl.allowed) return rateLimitResponse(rl)

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
      await bcrypt.compare(password, DUMMY_HASH)
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
  } catch (err: unknown) {
    // Log full detail server-side but never leak DB driver / hostname /
    // stack to the client. An attacker probing login should only ever
    // see a generic 500.
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[LOGIN ERROR]', msg, err)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
