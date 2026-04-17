import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { sendTransactionalEmail } from '@/lib/unisender'
import { rateLimit, clientIp, rateLimitResponse } from '@/lib/rate-limit'

const TOKEN_TTL_HOURS = 1

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function POST(req: NextRequest) {
  // 3 attempts per IP per 15 min — prevents email-bombing arbitrary addresses.
  const rl = await rateLimit('forgot_password', clientIp(req), 3, 15 * 60)
  if (!rl.allowed) return rateLimitResponse(rl)

  try {
    const { email } = await req.json()
    const normalized = typeof email === 'string' ? email.toLowerCase().trim() : ''

    if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) {
      return NextResponse.json({ error: 'Укажите корректный email' }, { status: 400 })
    }

    // Always return success — do not disclose whether the email exists.
    // Response shape is constant; the real work happens asynchronously below.
    const genericOk = NextResponse.json({
      ok: true,
      message: 'Если email зарегистрирован, мы отправили ссылку для сброса пароля.',
    })

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, email, name, is_active')
      .eq('email', normalized)
      .eq('is_active', true)
      .maybeSingle()

    if (!user) return genericOk

    // Create single-use token; store only its SHA-256 hash.
    const rawToken = crypto.randomBytes(32).toString('base64url')
    const tokenHash = hashToken(rawToken)
    const expiresAt = new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000).toISOString()

    const { error: insertErr } = await supabaseAdmin
      .from('password_reset_tokens')
      .insert({ user_id: user.id, token_hash: tokenHash, expires_at: expiresAt })

    if (insertErr) {
      console.error('[forgot-password] insert token:', insertErr.message)
      return genericOk
    }

    // Build reset URL from request origin (trusted — same-origin).
    const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
    const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
    const resetUrl = `${proto}://${host}/reset-password?token=${encodeURIComponent(rawToken)}`

    const html = `
      <p>Здравствуйте, ${escapeHtml(user.name ?? '')}!</p>
      <p>Вы запросили сброс пароля в ContentOS. Ссылка действует ${TOKEN_TTL_HOURS} час.</p>
      <p><a href="${resetUrl}" style="display:inline-block;padding:12px 20px;background:#a67ff0;color:#fff;border-radius:8px;text-decoration:none">Сбросить пароль</a></p>
      <p>Или скопируйте ссылку в браузер:<br><code style="word-break:break-all">${resetUrl}</code></p>
      <p>Если вы не запрашивали сброс — проигнорируйте это письмо.</p>
    `

    try {
      await sendTransactionalEmail({
        to: user.email,
        subject: 'ContentOS — сброс пароля',
        bodyHtml: html,
      })
    } catch (err) {
      // Email failed — log the reset URL so an admin can deliver it manually.
      // Never leak the URL to the HTTP response (would bypass email verification).
      console.error('[forgot-password] email send failed, manual URL:', resetUrl, err)
    }

    return genericOk
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка сервера'
    console.error('[forgot-password]', msg)
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
