import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { sessionOptions, type SessionData } from '@/lib/session'

// Unauthenticated paths. The OAuth callback stays public because Google
// redirects users here with no session cookie; CSRF protection is
// enforced via the `state` cookie inside the route handler. The OAuth
// START endpoint, however, used to be public — that let anyone hit our
// Google client_id and burn redirect quota. It's now auth-only so only
// logged-in admins can kick off the flow.
const PUBLIC_PATHS = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/callback',
  '/api/auth/start',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/youtube/oauth/callback',
  '/letters',
  '/api/newsletter/subscribe',
  '/api/health',
  '/v',
  '/podcasts',
]

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (
    PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/')) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  // Validate iron-session cookie — actually decrypt, not just check existence.
  const res = NextResponse.next()
  const session = await getIronSession<SessionData>(req, res, sessionOptions)

  if (!session.userId) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
    }
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
