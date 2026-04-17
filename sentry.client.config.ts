/**
 * Sentry — browser-side. Captures uncaught errors in pages and components.
 */

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
const environment = process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NODE_ENV ?? 'development'
const release = process.env.NEXT_PUBLIC_BUILD_SHA

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release,

    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,        // off — we're not on a paid plan
    replaysOnErrorSampleRate: 0,

    sendDefaultPii: false,

    ignoreErrors: [
      'ResizeObserver loop completed with undelivered notifications',
      'Не авторизован',
    ],
  })
}
