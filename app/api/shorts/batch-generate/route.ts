import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getQueue } from '@/lib/queue'
import { supabaseAdmin } from '@/lib/supabase'

// POST /api/shorts/batch-generate
// Queue AI title generation for shorts that don't have generated_title yet
// Accepts { channelId, videoIds? } — if videoIds provided, only process those
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { channelId, videoIds } = await req.json()
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 })

    let query = supabaseAdmin
      .from('yt_videos')
      .select('id, yt_video_id, current_title, generated_title')
      .eq('channel_id', channelId)
      .lte('duration_seconds', 180)
      .gt('duration_seconds', 0)

    if (videoIds?.length) {
      query = query.in('id', videoIds)
    } else {
      query = query.is('generated_title', null)
    }

    const { data: shorts, error } = await query
    if (error) throw new Error(error.message)
    if (!shorts?.length) return NextResponse.json({ success: true, queued: 0 })

    const q = getQueue()
    let queued = 0

    for (const short of shorts) {
      await q.add('generate_short_title', { videoId: short.id }, {
        attempts: 2,
        priority: 5,
        delay: queued * 2000, // stagger to avoid rate limits
      })
      queued++
    }

    return NextResponse.json({ success: true, queued, total: shorts.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
