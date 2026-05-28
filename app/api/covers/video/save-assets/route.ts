// POST /api/covers/video/save-assets
// Persists chosen face photos + style reference into producer_output so they
// survive reloads and pre-fill the generator. Ported from the old
// /api/thumbnail/save-assets.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { videoId, photos, reference } = await req.json()
    if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 })

    const { data: video } = await supabaseAdmin
      .from('yt_videos')
      .select('producer_output')
      .eq('id', videoId)
      .single()

    const po = (video?.producer_output as Record<string, unknown>) ?? {}
    const updated = {
      ...po,
      saved_photos: photos ?? po.saved_photos ?? [],
      saved_reference: reference ?? po.saved_reference ?? null,
    }

    await supabaseAdmin
      .from('yt_videos')
      .update({ producer_output: updated, updated_at: new Date().toISOString() })
      .eq('id', videoId)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
