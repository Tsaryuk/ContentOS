/**
 * Sentry — server-side (Next.js API routes, middleware, server components).
 * Runs only when SENTRY_DSN is set — safe no-op otherwise.
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

    // Capture 100% of errors, sample 10% of transactions in production to
    // stay within the free 5k events/month tier. Adjust if we see volume.
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,

    // Send structured breadcrumbs for fetch / console / navigation, so
    // each error ticket includes what happened right before the error.
    integrations: [
      Sentry.httpIntegration(),
    ],

    // Don't capture PII by default — we pass userId explicitly where useful.
    sendDefaultPii: false,

    // Filter out noise: expected 401s / aborted requests are not errors.
    ignoreErrors: [
      'Не авторизован',
      'AbortError',
    ],

    beforeSend(event, hint) {
      const err = hint.originalException
      // Drop 4xx responses surfaced as errors — they're expected outcomes.
      if (err instanceof Error && /^4\d\d /.test(err.message)) return null
      return event
    },
  })
}
