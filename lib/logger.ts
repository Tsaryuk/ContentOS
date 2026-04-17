/**
 * Structured logger built on pino. Used in the worker hot-path and in
 * long-running API routes where we need fields attached to every line.
 *
 * Output:
 *   - production: one-JSON-line-per-event (pm2 logs) → grep-friendly.
 *   - dev: pino-pretty with colors and human times.
 *
 * Usage:
 *   import { logger } from '@/lib/logger'
 *   logger.info({ videoId, jobId, duration_ms }, 'transcribe done')
 *   const jobLog = logger.child({ videoId, jobName: 'produce' })
 *   jobLog.warn({ retry: 2 }, 'Claude rate-limited')
 */

import pino, { type Logger, type LoggerOptions } from 'pino'

const isProd = process.env.NODE_ENV === 'production'
const level = process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug')

const options: LoggerOptions = {
  level,
  base: {
    service: process.env.PM2_SERVICE_NAME ?? 'contentos',
    env: process.env.NODE_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_BUILD_SHA,
  },
  redact: {
    // Never log these fields, even if passed accidentally.
    paths: [
      '*.password',
      '*.password_hash',
      '*.refresh_token',
      '*.session_string',
      '*.access_token',
      '*.api_key',
      '*.SUPABASE_SERVICE_KEY',
      '*.SESSION_SECRET',
    ],
    censor: '[redacted]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
}

// pino-pretty is dev-only; in prod we emit raw JSON which pm2/journald happily
// consumes and Sentry can correlate via breadcrumbs.
const transport = isProd
  ? undefined
  : {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
    }

export const logger: Logger = transport
  ? pino({ ...options, transport })
  : pino(options)

export type { Logger } from 'pino'
