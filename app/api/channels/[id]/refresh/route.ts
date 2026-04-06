import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// POST /api/channels/[id]/refresh — re-fetch title/thumbnail from YouTube API
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { id } = params

  const { data: channel, error: chErr } = await supabaseAdmin
    .from('yt_channels')
    .select('yt_channel_id, refresh_token')
    .eq('id', id)
    .single()

  if (chErr || !channel) return NextResponse.json({ error: 'Channel not found' }, { status: 404 })

  // Get access token from channel's own refresh_token or any google_account
  let accessToken: string | null = null

  if (channel.refresh_token) {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: channel.refresh_token,
        client_id: process.env.YOUTUBE_CLIENT_ID!,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      }),
    })
    const tokens = await tokenRes.json()
    accessToken = tokens.access_token ?? null
  }

  if (!accessToken) {
    const { data: account } = await supabaseAdmin
      .from('google_accounts')
      .select('refresh_token')
      .limit(1)
      .single()
    if (account?.refresh_token) {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: account.refresh_token,
          client_id: process.env.YOUTUBE_CLIENT_ID!,
          client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
        }),
      })
      const tokens = await tokenRes.json()
      accessToken = tokens.access_token ?? null
    }
  }

  if (!accessToken) return NextResponse.json({ error: 'No valid token' }, { status: 401 })

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
}
