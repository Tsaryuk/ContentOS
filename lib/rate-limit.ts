/**
 * Redis-backed fixed-window rate limiter.
 *
 * Uses the existing Redis connection from lib/queue.ts (BullMQ shares it).
 * Key format: `rl:<bucket>:<identifier>:<window-timestamp>`
 * A single INCR + EXPIRE (NX) per request — constant time.
 */

import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getRedisConnection } from '@/lib/queue'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  resetSeconds: number
}

/**
 * @param bucket       Logical name (e.g. "login", "newsletter_subscribe").
 * @param identifier   Usually client IP; caller supplies.
 * @param limit        Max requests per window.
 * @param windowSec    Window size in seconds.
 */
export async function rateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const redis = getRedisConnection()
  const now = Math.floor(Date.now() / 1000)
  const windowStart = now - (now % windowSec)
  const key = `rl:${bucket}:${identifier}:${windowStart}`

  const count = await redis.incr(key)
  // Set TTL only on first hit to avoid resetting window on each request.
  if (count === 1) {
    await redis.expire(key, windowSec)
  }

  const remaining = Math.max(0, limit - count)
  const resetSeconds = windowSec - (now - windowStart)
  return {
    allowed: count <= limit,
    remaining,
    limit,
    resetSeconds,
  }
}

/**
 * Best-effort client IP from common proxy headers. Falls back to 'unknown'.
 * For VPS behind Nginx we set X-Forwarded-For. Do not use unvalidated
 * x-forwarded-for in production when proxy is untrusted.
 */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const real = req.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: 'Слишком много запросов, попробуйте позже' },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.resetSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    },
  )
}
