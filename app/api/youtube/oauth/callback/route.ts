import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${req.nextUrl.origin}/settings?oauth_error=${error}`)
  }

  if (!code) {
    return NextResponse.redirect(`${req.nextUrl.origin}/settings?oauth_error=no_code`)
  }

  const origin = req.nextUrl.origin
  const redirectUri = `${origin}/api/youtube/oauth/callback`

  // Exchange code for tokens
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
    }),
  })

  const tokens = await res.json()

  if (tokens.error || !tokens.refresh_token) {
    const msg = tokens.error_description || tokens.error || 'no_refresh_token'
    return NextResponse.redirect(`${origin}/settings?oauth_error=${encodeURIComponent(msg)}`)
  }

  // Get channel info for the new token
  const chRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  )
  const chData = await chRes.json()
  const channel = chData.items?.[0]

  // Save refresh token to yt_channels if we can match it
  if (channel?.id) {
    await supabaseAdmin
      .from('yt_channels')
      .upsert({
        yt_channel_id:  channel.id,
        title:          channel.snippet?.title ?? channel.id,
        refresh_token:  tokens.refresh_token,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'yt_channel_id' })
  }

  const channelTitle = channel?.snippet?.title ?? channel?.id ?? 'unknown'
  return NextResponse.redirect(
    `${origin}/settings?oauth_ok=1&channel=${encodeURIComponent(channelTitle)}&channel_id=${channel?.id ?? ''}`
  )
}
