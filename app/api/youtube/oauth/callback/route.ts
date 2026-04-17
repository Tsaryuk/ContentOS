import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { consumeOauthStateCookie } from '@/lib/oauth-state'
import { encryptSecret } from '@/lib/crypto-secrets'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')
  const state = req.nextUrl.searchParams.get('state')

  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const origin = `${proto}://${host}`

  if (error) {
    return NextResponse.redirect(`${origin}/settings?oauth_error=${encodeURIComponent(error)}`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/settings?oauth_error=no_code`)
  }

  // CSRF guard — verify state matches cookie set at /api/youtube/oauth/start
  {
    const errRes = NextResponse.redirect(`${origin}/settings?oauth_error=state_mismatch`)
    if (!consumeOauthStateCookie(req, errRes, 'youtube', state)) {
      return errRes
    }
  }

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

  // Save refresh token to yt_channels if we can match it, clear needs_reauth
  if (channel?.id) {
    await supabaseAdmin
      .from('yt_channels')
      .upsert({
        yt_channel_id:  channel.id,
        title:          channel.snippet?.title ?? channel.id,
        refresh_token:  encryptSecret(tokens.refresh_token),
        needs_reauth:   false,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'yt_channel_id' })
  }

  const channelTitle = channel?.snippet?.title ?? channel?.id ?? 'unknown'
  const successRes = NextResponse.redirect(
    `${origin}/settings?oauth_ok=1&channel=${encodeURIComponent(channelTitle)}&channel_id=${encodeURIComponent(channel?.id ?? '')}`
  )
  successRes.cookies.delete('contentos_oauth_state_youtube')
  return successRes
}
