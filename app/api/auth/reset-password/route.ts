import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimit, clientIp, rateLimitResponse } from '@/lib/rate-limit'

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

const MIN_PASSWORD_LEN = 10
const MAX_PASSWORD_LEN = 128

export async function POST(req: NextRequest) {
  // 10 attempts per IP per 10 min — prevents token brute-force.
  const rl = await rateLimit('reset_password', clientIp(req), 10, 10 * 60)
  if (!rl.allowed) return rateLimitResponse(rl)

  try {
    const { token, password } = await req.json()
    if (typeof token !== 'string' || typeof password !== 'string') {
      return NextResponse.json({ error: 'Некорректный запрос' }, { status: 400 })
    }

    if (password.length < MIN_PASSWORD_LEN || password.length > MAX_PASSWORD_LEN) {
      return NextResponse.json(
        { error: `Пароль должен быть от ${MIN_PASSWORD_LEN} до ${MAX_PASSWORD_LEN} символов` },
        { status: 400 },
      )
    }

    const tokenHash = hashToken(token)

    // Lookup token + join user in one round trip.
    const { data: row } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('id, user_id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()

    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json(
        { error: 'Ссылка недействительна или срок её действия истёк' },
        { status: 400 },
      )
    }

    const passwordHash = await bcrypt.hash(password, 12)

    // Update password + mark token used. Both inside an effective "transaction"
    // — if the second update fails the first one sticks, which is acceptable
    // (user can still log in with the new password; stale token expires anyway).
    const { error: updErr } = await supabaseAdmin
      .from('users')
      .update({ password_hash: passwordHash, updated_at: new Date().toISOString() })
      .eq('id', row.user_id)

    if (updErr) {
      return NextResponse.json({ error: 'Не удалось обновить пароль' }, { status: 500 })
    }

    // Invalidate this token + any other active tokens for this user.
    await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('user_id', row.user_id)
      .is('used_at', null)

    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сервера'
    console.error('[reset-password]', msg)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
