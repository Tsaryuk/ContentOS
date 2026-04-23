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

// GET /api/youtube/[id] — fetch a single yt_videos row
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('yt_videos')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Видео не найдено' }, { status: 404 })
  return NextResponse.json(data)
}

// Only these fields can be edited from the client — prevents arbitrary column
// tamper through /api/youtube/[id] PATCH (e.g. bumping ai_score or clearing
// transcript). Add new keys here when editable surface grows.
const VIDEO_ALLOWED_FIELDS = new Set([
  'generated_description',
  'generated_title',
  'selected_variants',
  'thumbnail_url',
])

// PATCH /api/youtube/[id] — update whitelisted editable fields on a video
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const raw = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = {}
  for (const key of Object.keys(raw ?? {})) {
    if (VIDEO_ALLOWED_FIELDS.has(key)) update[key] = raw[key]
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('yt_videos')
    .update(update)
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

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
