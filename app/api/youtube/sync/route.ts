// app/api/youtube/sync/route.ts
// POST /api/youtube/sync
// Вытягивает все видео канала → сохраняет в Supabase
// ⚠️  READ-ONLY: только читает YouTube, ничего не меняет на канале

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchChannelVideos } from '@/lib/youtube/videos'

export async function POST(req: NextRequest) {
  try {
    const { channelId } = await req.json()
    if (!channelId) {
      return NextResponse.json({ error: 'channelId required' }, { status: 400 })
    }

    // Проверяем что канал есть в нашей базе
    const { data: channel, error: chErr } = await supabaseAdmin
      .from('yt_channels')
      .select('id, yt_channel_id, title')
      .eq('yt_channel_id', channelId)
      .single()

    if (chErr || !channel) {
      return NextResponse.json({ error: 'Channel not found in DB' }, { status: 404 })
    }

    // Читаем видео с YouTube (только чтение)
    const ytVideos = await fetchChannelVideos(channelId)

    // Сохраняем в Supabase
    let synced = 0
    let skipped = 0
    let errors = 0

    // Detect whether privacy_status column exists (first video as probe)
    let hasPrivacyStatus = true
    if (ytVideos.length > 0) {
      const probe = await supabaseAdmin.from('yt_videos').select('privacy_status').limit(1)
      if (probe.error?.message?.includes('privacy_status')) hasPrivacyStatus = false
    }

    for (const v of ytVideos) {
      const row: Record<string, unknown> = {
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
        // status трогаем только если видео новое
      }
      if (hasPrivacyStatus) row.privacy_status = v.privacy_status

      const { error } = await supabaseAdmin
        .from('yt_videos')
        .upsert(row, {
          onConflict: 'yt_video_id',
          ignoreDuplicates: false,
        })

      if (error) { errors++; console.error('[sync] upsert error:', error) }
      else synced++
    }

    // Логируем джоб
    await supabaseAdmin.from('yt_jobs').insert({
      job_type: 'sync_channel',
      status:   errors === 0 ? 'done' : 'failed',
      result:   { synced, skipped, errors, total: ytVideos.length },
    })

    return NextResponse.json({
      success: true,
      channel: channel.title,
      total:   ytVideos.length,
      synced,
      errors,
    })

  } catch (err: any) {
    console.error('[sync]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
