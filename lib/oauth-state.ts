/**
 * OAuth CSRF protection — generates a random `state` value, stores it
 * in an httpOnly short-lived cookie, and verifies it on callback.
 *
 * Usage:
 *   // in /start route:
 *   const res = NextResponse.redirect(googleUrl)
 *   const state = setOauthStateCookie(res, 'youtube')
 *   googleUrl.searchParams.set('state', state)
 *
 *   // in /callback route:
 *   const ok = consumeOauthStateCookie(req, res, 'youtube', stateFromQuery)
 *   if (!ok) return redirect(errorUrl)
 */

import type { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

const STATE_COOKIE_PREFIX = 'contentos_oauth_state_'
const STATE_TTL_SECONDS = 600 // 10 minutes

function cookieName(flow: string): string {
  return `${STATE_COOKIE_PREFIX}${flow}`
}

export function generateState(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function setOauthStateCookie(res: NextResponse, flow: string): string {
  const state = generateState()
  res.cookies.set(cookieName(flow), state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_TTL_SECONDS,
  })
  return state
}

export function consumeOauthStateCookie(
  req: NextRequest,
  res: NextResponse,
  flow: string,
  stateFromQuery: string | null,
): boolean {
  const stored = req.cookies.get(cookieName(flow))?.value
  // Always clear the cookie — single use
  res.cookies.delete(cookieName(flow))
  if (!stored || !stateFromQuery) return false
  // Constant-time compare
  const a = Buffer.from(stored)
  const b = Buffer.from(stateFromQuery)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
