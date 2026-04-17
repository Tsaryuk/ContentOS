/**
 * Sentry initialization for the BullMQ worker process (`npx tsx worker.ts`).
 * Next.js doesn't wrap this, so we init it ourselves.
 *
 * Exports `captureWorkerError` — safe no-op when SENTRY_DSN is not set,
 * so worker keeps running in dev or if Sentry is intentionally disabled.
 */

import * as Sentry from '@sentry/node'

const dsn = process.env.SENTRY_DSN
const environment = process.env.SENTRY_ENV ?? process.env.NODE_ENV ?? 'development'
const release = process.env.NEXT_PUBLIC_BUILD_SHA

let initialized = false

export function initWorkerSentry(): void {
  if (initialized || !dsn) return
  Sentry.init({
    dsn,
    environment,
    release,
    tracesSampleRate: environment === 'production' ? 0.05 : 0,
    sendDefaultPii: false,
    integrations: [Sentry.httpIntegration()],
  })
  initialized = true
}

export interface JobContext {
  jobId?: string
  jobName?: string
  videoId?: string
  attempt?: number
}

export function captureWorkerError(err: unknown, ctx: JobContext = {}): void {
  if (!initialized) return
  Sentry.withScope(scope => {
    scope.setTag('module', 'worker')
    if (ctx.jobName) scope.setTag('job.name', ctx.jobName)
    if (ctx.jobId)   scope.setTag('job.id', ctx.jobId)
    if (ctx.videoId) scope.setTag('video.id', ctx.videoId)
    if (ctx.attempt) scope.setExtra('attempt', ctx.attempt)
    Sentry.captureException(err)
  })
}
