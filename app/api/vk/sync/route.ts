import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getQueue } from '@/lib/queue'

// POST /api/vk/sync — enqueue an immediate sync of all VK channels' videos
// (same handler the daily cron uses). Lets the user pull videos right after
// connecting instead of waiting for the next scheduled run.
export async function POST() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  await getQueue().add('vk_sync_all', {}, { removeOnComplete: true, removeOnFail: true })
  return NextResponse.json({ success: true })
}
