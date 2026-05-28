// POST /api/covers/video/generate
// Generates YouTube thumbnails (faces + 2-line text + channel style presets,
// 4 emotion variants) via the ported engine in lib/covers/video-thumbnail.
// Replaces the old /api/thumbnail/generate.
//
// `dryRun: true` returns the resolved prompt + image list WITHOUT calling fal,
// so the UI can preview what goes into the model.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { rateLimit, clientIp, rateLimitResponse } from '@/lib/rate-limit'
import {
  buildVideoThumbnailPreview,
  generateVideoThumbnails,
  type VideoThumbnailInput,
} from '@/lib/covers/video-thumbnail'

export const maxDuration = 180
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  let body: VideoThumbnailInput & { dryRun?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
  }

  if (!body.videoId || !body.text) {
    return NextResponse.json({ error: 'videoId and text required' }, { status: 400 })
  }

  // dryRun is cheap (no fal call) — skip the rate-limit so previews stay snappy.
  if (body.dryRun === true) {
    try {
      const preview = await buildVideoThumbnailPreview(body)
      return NextResponse.json(preview)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка превью'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  // Real generation fires 4 parallel nano-banana edits. Shared ai:cover bucket.
  const rl = await rateLimit('ai:cover', clientIp(req), 5, 60)
  if (!rl.allowed) return rateLimitResponse(rl)

  const session = await getSession()
  try {
    const result = await generateVideoThumbnails(
      body,
      session.activeProjectId ?? null,
      auth.userId,
    )
    return NextResponse.json({ success: true, urls: result.urls, models: result.models, styleId: result.styleId })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка генерации'
    console.error('[covers-video] generate:', msg)
    // disallowed-URL errors are client mistakes
    const status = /allow-list|disallowed/.test(msg) ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
