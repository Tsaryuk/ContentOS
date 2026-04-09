import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { getYouTubeToken } from '@/lib/youtube/auth'
import { youtubeErrorResponse } from '@/lib/youtube/errors'

// POST /api/channels/[id]/refresh — re-fetch title/thumbnail from YouTube API
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { id } = params

  const { data: channel, error: chErr } = await supabaseAdmin
    .from('yt_channels')
    .select('yt_channel_id')
    .eq('id', id)
    .single()

  if (chErr || !channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

  try {
    const accessToken = await getYouTubeToken({ id })

    const ytRes = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channel.yt_channel_id}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    )
    const ytData = await ytRes.json()
    const item = ytData.items?.[0]
    if (!item) return NextResponse.json({ error: 'YouTube channel not found' }, { status: 404 })

    const updated = {
      title: item.snippet?.title ?? channel.yt_channel_id,
      handle: item.snippet?.customUrl ?? null,
      thumbnail_url: item.snippet?.thumbnails?.default?.url ?? null,
      updated_at: new Date().toISOString(),
    }

    const { error: updateErr } = await supabaseAdmin
      .from('yt_channels')
      .update(updated)
      .eq('id', id)

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, ...updated })
  } catch (err: unknown) {
    console.error('[channels/refresh]', err instanceof Error ? err.message : err)
    return youtubeErrorResponse(err)
  }
}
