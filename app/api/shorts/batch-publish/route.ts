import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getQueue } from '@/lib/queue'
import { supabaseAdmin } from '@/lib/supabase'

// POST /api/shorts/batch-publish
// Approve and queue YouTube update for selected shorts
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { videoIds } = await req.json() as { videoIds: string[] }
    if (!videoIds?.length) return NextResponse.json({ error: 'videoIds required' }, { status: 400 })

    // Validate: all must have generated_title
    const { data: shorts, error } = await supabaseAdmin
      .from('yt_videos')
      .select('id, generated_title, generated_description')
      .in('id', videoIds)

    if (error) throw new Error(error.message)

    const ready = (shorts ?? []).filter(s => s.generated_title)
    if (!ready.length) {
      return NextResponse.json({ error: 'No shorts with generated titles' }, { status: 400 })
    }

    const q = getQueue()
    let queued = 0

    for (const short of ready) {
      // Mark approved
      await supabaseAdmin
        .from('yt_videos')
        .update({ is_approved: true, shorts_status: 'approved' })
        .eq('id', short.id)

      // Queue publish job with delay to respect YouTube API quota
      await q.add('publish', {
        videoId: short.id,
        overrides: { title: short.generated_title },
      }, {
        attempts: 2,
        priority: 3,
        delay: queued * 3000, // 3s between publishes
      })
      queued++
    }

    return NextResponse.json({ success: true, queued, skipped: videoIds.length - queued })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
