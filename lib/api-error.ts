/**
 * Uniform error handler for API routes.
 *
 * Captures the exception in Sentry (tagged with the route name) and writes
 * a structured pino log line. Returns a NextResponse so the route can do
 * `return handleApiError(err, '/api/process/publish')`.
 *
 * Gated on SENTRY_DSN — safe no-op when Sentry isn't configured.
 *
 * Why needed: Next.js App Router silently swallows console.error output
 * from production API routes (seen during the Apr 18 B-01 investigation —
 * a 500 response left no trace anywhere). Explicit Sentry capture is the
 * only reliable way to get server-side API stacks.
 */

import { NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { logger } from '@/lib/logger'

export interface ApiErrorContext {
  route: string
  videoId?: string
  userId?: string
  extra?: Record<string, unknown>
}

export function handleApiError(err: unknown, ctx: ApiErrorContext): NextResponse {
  const error = err instanceof Error ? err : new Error(String(err))

  // Structured server log — grep-friendly in pm2 logs.
  logger.error(
    {
      module: 'api',
      route: ctx.route,
      videoId: ctx.videoId,
      userId: ctx.userId,
      err: error.message,
      stack: error.stack,
      ...ctx.extra,
    },
    'api route failed',
  )

  // Sentry — gated internally by the DSN-init check in sentry.server.config.
  try {
    Sentry.withScope(scope => {
      scope.setTag('api.route', ctx.route)
      if (ctx.videoId) scope.setTag('video.id', ctx.videoId)
      if (ctx.userId)  scope.setTag('user.id', ctx.userId)
      if (ctx.extra)   scope.setContext('extra', ctx.extra)
      Sentry.captureException(error)
    })
  } catch {
    // never let Sentry init issues shadow the real error
  }

  return NextResponse.json(
    { error: error.message || 'Ошибка сервера' },
    { status: 500 },
  )
}
