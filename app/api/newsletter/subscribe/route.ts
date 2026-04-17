import { NextRequest, NextResponse } from 'next/server'
import { subscribe } from '@/lib/unisender'
import { rateLimit, clientIp, rateLimitResponse } from '@/lib/rate-limit'

// Public endpoint — no auth required (for landing page)
export async function POST(req: NextRequest) {
  // 5 subscribe attempts per IP per 10 min. Anti-spam.
  const rl = await rateLimit('subscribe', clientIp(req), 5, 600)
  if (!rl.allowed) return rateLimitResponse(rl)

  try {
    const body = await req.json()
    const email = body.email?.trim()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Укажите корректный email' }, { status: 400 })
    }

    if (email.length > 254) {
      return NextResponse.json({ error: 'Email слишком длинный' }, { status: 400 })
    }
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : undefined

    const personId = await subscribe(email, name)

    return NextResponse.json({ success: true, person_id: personId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка подписки'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
