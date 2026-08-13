import { NextRequest, NextResponse } from 'next/server'
import { generateState } from '@/lib/oauth-state'

// Start VK OAuth (Authorization Code Flow). Requests a USER token with
// video,offline,groups — offline so it never expires, groups so we can list
// the admin communities on callback. The user must be an admin of the VK
// communities whose videos we manage.
export async function GET(req: NextRequest) {
  const clientId = process.env.VK_CLIENT_ID
  if (!clientId) {
    return NextResponse.json({ error: 'VK_CLIENT_ID not set' }, { status: 500 })
  }

  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const origin = `${proto}://${host}`
  const redirectUri = `${origin}/api/vk/oauth/callback`

  const state = generateState()
  const url = new URL('https://oauth.vk.com/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', 'video,offline,groups')
  url.searchParams.set('v', '5.199')
  url.searchParams.set('display', 'page')
  url.searchParams.set('state', state)

  const res = NextResponse.redirect(url.toString())
  res.cookies.set('contentos_oauth_state_vk', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  })
  return res
}
