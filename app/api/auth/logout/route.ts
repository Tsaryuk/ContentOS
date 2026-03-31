import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function POST() {
  const session = await getSession()
  session.destroy()

  const res = NextResponse.json({ ok: true })
  res.cookies.delete('contentos_auth')
  return res
}
