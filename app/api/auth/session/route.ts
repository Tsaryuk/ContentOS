import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function GET() {
  const session = await getSession()
  return NextResponse.json({
    activeChannelId: session.activeChannelId ?? null,
    activeProjectId: session.activeProjectId ?? null,
  })
}
