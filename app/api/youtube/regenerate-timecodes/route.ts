import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getQueue } from '@/lib/queue'

// POST /api/youtube/regenerate-timecodes — regenerate timecodes only (no full produce)
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { videoId } = await req.json()
  if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 })

  const q = getQueue()
  await q.add('regenerate_timecodes', { videoId }, { attempts: 1 })
  return NextResponse.json({ ok: true })
}
