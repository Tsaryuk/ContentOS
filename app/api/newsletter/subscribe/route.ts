import { NextRequest, NextResponse } from 'next/server'
import { subscribe } from '@/lib/unisender'

// Public endpoint — no auth required (for landing page)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = body.email?.trim()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Укажите корректный email' }, { status: 400 })
    }

    const personId = await subscribe(email, body.name?.trim())

    return NextResponse.json({ success: true, person_id: personId })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка подписки'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
