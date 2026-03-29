// app/api/youtube/sync/route.ts
// POST /api/youtube/sync
// Pulls all channel videos → upserts to Supabase (bulk)
// READ-ONLY: only reads YouTube, never writes to channel

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchChannelVideos } from '@/lib/youtube/videos'

const BATCH_SIZE = 50

export async function POST(req: NextRequest) {
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

    const ytVideos = await fetchChannelVideos(channelId)

    // Build rows for bulk upsert
    const rows = ytVideos.map(v => ({
      channel_id:          channel.id,
      yt_video_id:         v.id,
      current_title:       v.title,
      current_description: v.description,
      current_tags:        v.tags,
      current_thumbnail:   v.thumbnail,
      duration_seconds:    v.duration_seconds,
      published_at:        v.published_at,
      view_count:          v.view_count,
      like_count:          v.like_count,
      privacy_status:      v.privacy_status,
    }))

    // Bulk upsert in batches
    let synced = 0
    let errors = 0

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)
      const { error } = await supabaseAdmin
        .from('yt_videos')
        .upsert(batch, { onConflict: 'yt_video_id', ignoreDuplicates: false })

      if (error) {
        errors += batch.length
        console.error('[sync] batch upsert error:', error.message)
      } else {
        synced += batch.length
      }
    }

    await supabaseAdmin.from('yt_jobs').insert({
      job_type: 'sync_channel',
      status: errors === 0 ? 'done' : 'failed',
      result: { synced, errors, total: ytVideos.length },
    })

    return NextResponse.json({
      success: true,
      channel: channel.title,
      total: ytVideos.length,
      synced,
      errors,
    })

  } catch (err: any) {
    console.error('[sync]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
