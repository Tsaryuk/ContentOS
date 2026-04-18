/**
 * GET  /api/youtube/[id]/short-link — return existing link for the video, if any.
 * POST /api/youtube/[id]/short-link — lazily create a short_links row for this
 * YouTube video and return { slug, url, clicks }. Idempotent: returns the
 * existing row if one already exists.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { handleApiError } from '@/lib/api-error'
import {
  generateShortSlug,
  buildYouTubeWebUrl,
  shortLinkUrl,
} from '@/lib/short-links'

interface VideoRow {
  id: string
  yt_video_id: string | null
}

interface ShortLinkRow {
  slug: string
  clicks: number | null
}

async function getExisting(videoId: string): Promise<ShortLinkRow | null> {
  const { data } = await supabaseAdmin
    .from('short_links')
    .select('slug, clicks')
    .eq('kind', 'youtube_video')
    .eq('video_id', videoId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<ShortLinkRow>()
  return data ?? null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id: videoId } = await params

  try {
    const existing = await getExisting(videoId)
    if (!existing) {
      return NextResponse.json({ link: null })
    }
    return NextResponse.json({
      link: {
        slug: existing.slug,
        url: shortLinkUrl(existing.slug),
        clicks: existing.clicks ?? 0,
      },
    })
  } catch (err: unknown) {
    return handleApiError(err, {
      route: '/api/youtube/[id]/short-link (GET)',
      userId: auth.userId,
      extra: { videoId },
    })
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id: videoId } = await params

  try {
    const { data: video, error: vidErr } = await supabaseAdmin
      .from('yt_videos')
      .select('id, yt_video_id')
      .eq('id', videoId)
      .single<VideoRow>()

    if (vidErr || !video || !video.yt_video_id) {
      return NextResponse.json({ error: 'Видео не найдено' }, { status: 404 })
    }

    const existing = await getExisting(videoId)
    if (existing) {
      return NextResponse.json({
        link: {
          slug: existing.slug,
          url: shortLinkUrl(existing.slug),
          clicks: existing.clicks ?? 0,
        },
      })
    }

    const targetUrl = buildYouTubeWebUrl(video.yt_video_id)

    // Retry a few times on slug collision (vanishingly rare with nanoid).
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = generateShortSlug()
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('short_links')
        .insert({
          slug,
          kind: 'youtube_video',
          video_id: video.id,
          target_url: targetUrl,
          created_by: auth.userId,
        })
        .select('slug, clicks')
        .single<ShortLinkRow>()

      if (!insErr && inserted) {
        return NextResponse.json({
          link: {
            slug: inserted.slug,
            url: shortLinkUrl(inserted.slug),
            clicks: inserted.clicks ?? 0,
          },
        })
      }

      const code = (insErr as { code?: string } | null)?.code
      if (code !== '23505') {
        return NextResponse.json(
          { error: insErr?.message ?? 'Не удалось создать ссылку' },
          { status: 500 },
        )
      }
    }

    return NextResponse.json(
      { error: 'Не удалось сгенерировать уникальный slug' },
      { status: 500 },
    )
  } catch (err: unknown) {
    return handleApiError(err, {
      route: '/api/youtube/[id]/short-link (POST)',
      userId: auth.userId,
      extra: { videoId },
    })
  }
}
