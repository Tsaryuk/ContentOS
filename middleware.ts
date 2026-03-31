import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  // Primary: check iron-session cookie (encrypted, signed)
  const session = req.cookies.get('contentos_session')?.value
  if (session) {
    return NextResponse.next()
  }

  // Fallback: legacy password cookie (backward compat)
  const auth = req.cookies.get('contentos_auth')?.value
  if (auth === process.env.ADMIN_PASSWORD) {
    return NextResponse.next()
  }

  const loginUrl = new URL('/login', req.url)
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
