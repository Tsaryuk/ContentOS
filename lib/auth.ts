import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

interface AuthResult {
  userId: string
  userRole: 'admin' | 'manager'
}

export async function requireAuth(): Promise<AuthResult | NextResponse> {
  const session = await getSession()
  if (!session.userId) {
    return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  }
  return { userId: session.userId, userRole: session.userRole ?? 'manager' }
}

export async function requireAdmin(): Promise<AuthResult | NextResponse> {
  const result = await requireAuth()
  if (result instanceof NextResponse) return result
  if (result.userRole !== 'admin') {
    return NextResponse.json({ error: 'Недостаточно прав' }, { status: 403 })
  }
  return result
}
