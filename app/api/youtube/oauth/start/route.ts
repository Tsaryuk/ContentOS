import { NextRequest, NextResponse } from 'next/server'
import { generateState } from '@/lib/oauth-state'

export async function GET(req: NextRequest) {
  const clientId = process.env.YOUTUBE_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'YOUTUBE_CLIENT_ID not set' }, { status: 500 })
  }

  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const origin = `${proto}://${host}`
  const redirectUri = `${origin}/api/youtube/oauth/callback`

  const state = generateState()

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/youtube')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent select_account')
  url.searchParams.set('state', state)

  const res = NextResponse.redirect(url.toString())
  res.cookies.set('contentos_oauth_state_youtube', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return res
}
