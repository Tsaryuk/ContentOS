/**
 * Admin-only: enqueue an immediate YouTube channels refresh.
 * Equivalent to the daily cron but run on demand, so user doesn't have to
 * wait 24h after adding/reconnecting to see fresh subscribers on Dashboard.
 */

import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { handleApiError } from '@/lib/api-error'
import { enqueueProcessJob } from '@/lib/process/enqueue'

export async function POST(): Promise<NextResponse> {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    // videoId in enqueueProcessJob is really just a unique key — for global
    // jobs we use 'global' so the idempotency key is channels_refresh--global.
    await enqueueProcessJob('channels_refresh', 'global', {})
    return NextResponse.json({ ok: true, queued: true })
  } catch (err: unknown) {
    return handleApiError(err, { route: '/api/admin/refresh-channels', userId: auth.userId })
  }
}
