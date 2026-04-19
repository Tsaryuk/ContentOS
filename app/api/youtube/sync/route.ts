// app/api/youtube/sync/route.ts
// POST /api/youtube/sync
// Pulls all channel videos → upserts to Supabase (bulk)
// READ-ONLY: only reads YouTube, never writes to channel

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { syncChannel } from '@/lib/youtube/sync-channel'
import { youtubeErrorResponse } from '@/lib/youtube/errors'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { channelId } = await req.json()
    if (!channelId) {
      return NextResponse.json({ error: 'channelId required' }, { status: 400 })
    }

    const { data: channel, error: chErr } = await supabaseAdmin
      .from('yt_channels')
      .select('id, yt_channel_id, title')
      .eq('yt_channel_id', channelId)
      .single()

    if (chErr || !channel) {
      return NextResponse.json({ error: 'Channel not found in DB' }, { status: 404 })
    }

    const result = await syncChannel(channel)

    await supabaseAdmin.from('yt_jobs').insert({
      job_type: 'sync_channel',
      status: result.errors === 0 ? 'done' : 'failed',
      result: { synced: result.synced, errors: result.errors, removed: result.removed, total: result.total },
    })

    return NextResponse.json({
      success: true,
      channel: result.title,
      total: result.total,
      synced: result.synced,
      errors: result.errors,
      removed: result.removed,
    })

  } catch (err: unknown) {
    console.error('[sync]', err instanceof Error ? err.message : err)
    return youtubeErrorResponse(err)
  }
}
