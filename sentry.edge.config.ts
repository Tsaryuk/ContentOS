/**
 * Sentry — Next.js Edge runtime (middleware.ts).
 */

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN
const environment = process.env.SENTRY_ENV ?? process.env.NODE_ENV ?? 'development'
const release = process.env.NEXT_PUBLIC_BUILD_SHA

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
  })
}
