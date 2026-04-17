// app/api/youtube/sync/route.ts
// POST /api/youtube/sync
// Pulls all channel videos → upserts to Supabase (bulk)
// READ-ONLY: only reads YouTube, never writes to channel

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { fetchChannelVideos } from '@/lib/youtube/videos'
import { youtubeErrorResponse } from '@/lib/youtube/errors'

const BATCH_SIZE = 50

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

    const ytVideos = await fetchChannelVideos(channelId)

    // Build rows for bulk upsert — we deliberately do NOT include content_type
    // here, so manual UI overrides (saved in DB) survive re-sync. content_type
    // is backfilled after the upsert only for rows where it's NULL (new videos).
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

    // Remove videos deleted from YouTube
    let removed = 0
    const ytVideoIds = new Set(ytVideos.map(v => v.id))
    const { data: dbVideos } = await supabaseAdmin
      .from('yt_videos')
      .select('id, yt_video_id')
      .eq('channel_id', channel.id)

    if (dbVideos) {
      const toDelete = dbVideos.filter(v => !ytVideoIds.has(v.yt_video_id))
      if (toDelete.length > 0) {
        const ids = toDelete.map(v => v.id)
        // Delete related records first
        await supabaseAdmin.from('yt_jobs').delete().in('video_id', ids)
        await supabaseAdmin.from('yt_changes').delete().in('video_id', ids)
        await supabaseAdmin.from('yt_social_drafts').delete().in('video_id', ids)
        await supabaseAdmin.from('yt_videos').delete().in('id', ids)
        removed = toDelete.length
        console.log(`[sync] Removed ${removed} deleted videos`)
      }
    }

    // Backfill content_type for freshly-inserted rows that lack one.
    // Manual overrides are preserved because we target only NULL.
    // ≤60s → short, ≤3000s (50 min) → video, else podcast.
    // Matches the CHECK constraint in migration 022.
    const { data: missingType } = await supabaseAdmin
      .from('yt_videos')
      .select('id, duration_seconds')
      .eq('channel_id', channel.id)
      .is('content_type', null)

    if (missingType && missingType.length > 0) {
      const buckets: Record<'short' | 'video' | 'podcast', string[]> = { short: [], video: [], podcast: [] }
      for (const v of missingType) {
        const d = v.duration_seconds ?? 0
        const t = d > 0 && d <= 60 ? 'short' : d > 0 && d <= 3000 ? 'video' : 'podcast'
        buckets[t].push(v.id)
      }
      for (const t of ['short', 'video', 'podcast'] as const) {
        if (buckets[t].length === 0) continue
        await supabaseAdmin.from('yt_videos').update({ content_type: t }).in('id', buckets[t])
      }
    }

    await supabaseAdmin.from('yt_jobs').insert({
      job_type: 'sync_channel',
      status: errors === 0 ? 'done' : 'failed',
      result: { synced, errors, removed, total: ytVideos.length },
    })

    return NextResponse.json({
      success: true,
      channel: channel.title,
      total: ytVideos.length,
      synced,
      errors,
      removed,
    })

  } catch (err: unknown) {
    console.error('[sync]', err instanceof Error ? err.message : err)
    return youtubeErrorResponse(err)
  }
}
