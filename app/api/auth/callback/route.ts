import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const origin = `${proto}://${host}`
  const code  = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(`${origin}/settings?oauth_error=${encodeURIComponent(error)}`)
  }
  if (!code) {
    return NextResponse.redirect(`${origin}/settings?oauth_error=no_code`)
  }

  const redirectUri = `${origin}/api/auth/callback`

  // 1. Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
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
  const tokens = await tokenRes.json()

  if (tokens.error || !tokens.refresh_token) {
    const msg = tokens.error_description || tokens.error || 'no_refresh_token'
    return NextResponse.redirect(`${origin}/settings?oauth_error=${encodeURIComponent(msg)}`)
  }

  // 2. Get Google profile
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  const profile = await profileRes.json()

  // 3. Save Google account (upsert)
  const { data: googleAccount, error: gaErr } = await supabaseAdmin
    .from('google_accounts')
    .upsert({
      google_id:     profile.id,
      email:         profile.email,
      name:          profile.name,
      picture:       profile.picture,
      refresh_token: tokens.refresh_token,
      updated_at:    new Date().toISOString(),
    }, { onConflict: 'google_id' })
    .select('id')
    .single()

  if (gaErr || !googleAccount) {
    return NextResponse.redirect(`${origin}/settings?oauth_error=db_error`)
  }

  // 4. Discover all YouTube channels for this account
  const chRes = await fetch(
    'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true&maxResults=50',
    { headers: { Authorization: `Bearer ${tokens.access_token}` } }
  )
  const chData = await chRes.json()
  const channels = chData.items || []

  // 5. Upsert each channel, link to google_account
  for (const ch of channels) {
    await supabaseAdmin
      .from('yt_channels')
      .upsert({
        yt_channel_id:    ch.id,
        title:            ch.snippet?.title ?? ch.id,
        handle:           ch.snippet?.customUrl ?? null,
        thumbnail_url:    ch.snippet?.thumbnails?.default?.url ?? null,
        subscriber_count: parseInt(ch.statistics?.subscriberCount || '0'),
        video_count:      parseInt(ch.statistics?.videoCount || '0'),
        google_account_id: googleAccount.id,
        refresh_token:    tokens.refresh_token,
        updated_at:       new Date().toISOString(),
      }, { onConflict: 'yt_channel_id' })
  }

  // 6. Set session — activate first channel found
  const firstChannel = channels[0]
  if (firstChannel) {
    const session = await getSession()
    session.activeChannelId = firstChannel.id
    await session.save()
  }

  const count = channels.length
  return NextResponse.redirect(
    `${origin}/settings?oauth_ok=1&email=${encodeURIComponent(profile.email)}&channels=${count}`
  )
}
