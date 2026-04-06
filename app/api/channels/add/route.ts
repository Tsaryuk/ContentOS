import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// POST /api/channels/add — add YouTube channel by ID
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { ytChannelId, projectId } = await req.json()
  if (!ytChannelId) return NextResponse.json({ error: 'ytChannelId required' }, { status: 400 })

  // Fetch channel info from YouTube (public, no auth needed for snippet)
  const apiKey = process.env.YOUTUBE_API_KEY ?? ''
  let chInfo: { title: string; handle: string | null; thumbnail: string | null } | null = null

  // Try with API key first, fallback to refresh token approach
  if (apiKey) {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${ytChannelId}&key=${apiKey}`
    )
    const data = await res.json()
    const item = data.items?.[0]
    if (item) {
      chInfo = {
        title: item.snippet?.title ?? ytChannelId,
        handle: item.snippet?.customUrl ?? null,
        thumbnail: item.snippet?.thumbnails?.default?.url ?? null,
      }
    }
  }

  // If no API key or lookup failed, try using stored refresh token from any connected account
  if (!chInfo) {
    const { data: accounts } = await supabaseAdmin
      .from('google_accounts')
      .select('refresh_token')
      .limit(1)
      .single()

    if (accounts?.refresh_token) {
      // Get fresh access token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: accounts.refresh_token,
          client_id: process.env.YOUTUBE_CLIENT_ID!,
          client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
        }),
      })
      const tokens = await tokenRes.json()

      if (tokens.access_token) {
        const res = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${ytChannelId}`,
          { headers: { Authorization: `Bearer ${tokens.access_token}` } }
        )
        const data = await res.json()
        const item = data.items?.[0]
        if (item) {
          chInfo = {
            title: item.snippet?.title ?? ytChannelId,
            handle: item.snippet?.customUrl ?? null,
            thumbnail: item.snippet?.thumbnails?.default?.url ?? null,
          }
        }
      }
    }
  }

  if (!chInfo) {
    return NextResponse.json({ error: 'Канал не найден. Проверьте ID.' }, { status: 404 })
  }

  const { data, error } = await supabaseAdmin
    .from('yt_channels')
    .upsert({
      yt_channel_id: ytChannelId,
      title: chInfo.title,
      handle: chInfo.handle,
      thumbnail_url: chInfo.thumbnail,
      project_id: projectId ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'yt_channel_id' })
    .select('id, title')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, channel: data })
}
