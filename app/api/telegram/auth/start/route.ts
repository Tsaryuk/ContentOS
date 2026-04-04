import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAuthClient } from '@/lib/telegram/client'
import { setPendingAuth } from '@/lib/telegram/auth-store'
import { Api } from 'telegram'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { phone } = await req.json()
    if (!phone?.trim()) {
      return NextResponse.json({ error: 'Номер телефона обязателен' }, { status: 400 })
    }

    const client = createAuthClient()
    await client.connect()

    const result = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId: Number(process.env.TELEGRAM_API_ID),
        apiHash: process.env.TELEGRAM_API_HASH!,
        settings: new Api.CodeSettings({}),
      })
    )

    // Store client for 5 minutes (enough to enter code)
    setPendingAuth(phone, client)

    return NextResponse.json({
      success: true,
      phoneCodeHash: result.phoneCodeHash,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ошибка отправки кода'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
