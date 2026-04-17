import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { requireAuth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { channelId, projectId } = await req.json()
  const session = await getSession()
  if (channelId) session.activeChannelId = channelId
  if (projectId) session.activeProjectId = projectId
  await session.save()
  return NextResponse.json({ ok: true })
}
