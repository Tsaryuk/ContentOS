/**
 * DELETE /api/youtube/[id] — remove a yt_videos row and its child records.
 *
 * Used when a video was deleted on YouTube (or the user no longer wants it in
 * ContentOS) and we want to drop it without waiting for the next channel sync.
 * Mirrors the cascade behavior of /api/youtube/sync so both paths stay
 * consistent; tg_posts.video_id is nullable with NO ACTION FK, so we null it
 * before deleting the video.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { handleApiError } from '@/lib/api-error'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id: videoId } = await params

  try {
    const { data: video, error: vidErr } = await supabaseAdmin
      .from('yt_videos')
      .select('id')
      .eq('id', videoId)
      .maybeSingle<{ id: string }>()

    if (vidErr) {
      return NextResponse.json({ error: vidErr.message }, { status: 500 })
    }
    if (!video) {
      return NextResponse.json({ error: 'Видео не найдено' }, { status: 404 })
    }

    await supabaseAdmin.from('yt_jobs').delete().eq('video_id', videoId)
    await supabaseAdmin.from('yt_changes').delete().eq('video_id', videoId)
    await supabaseAdmin.from('yt_social_drafts').delete().eq('video_id', videoId)
    await supabaseAdmin.from('tg_posts').update({ video_id: null }).eq('video_id', videoId)

    const { error: delErr } = await supabaseAdmin
      .from('yt_videos')
      .delete()
      .eq('id', videoId)

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return handleApiError(err, {
      route: '/api/youtube/[id] (DELETE)',
      userId: auth.userId,
      extra: { videoId },
    })
  }
}
