// Centralised registration of repeating BullMQ jobs (cron-like).
//
// Each entry uses BullMQ's `repeat.every` (ms) + a fixed `jobId` —
// re-running this on worker restart is a no-op for the same jobId,
// which is the whole point of having a deterministic schedule.
//
// Why moved out of worker.ts: previously the worker file held ~100
// lines of scheduling code interleaved with handlers and one-off
// init. This module keeps the schedule explicit and testable in
// isolation; the worker just calls registerCronSchedules(queue) at
// boot.

import type { Queue } from 'bullmq'

interface CronSpec {
  name: string
  jobId: string
  everyMs: number
  description: string
}

// Edit this list to add a new repeating job. Keep the human description
// short — it's logged on boot so you can audit the schedule from PM2
// logs without grepping code.
const SCHEDULES: CronSpec[] = [
  {
    name: 'newsletter_stats',
    jobId: 'newsletter_stats_cron',
    everyMs: 6 * 60 * 60 * 1000,
    description: 'каждые 6 часов — pull кампаний из Unisender',
  },
  {
    name: 'metrics_snapshot',
    jobId: 'metrics_snapshot_cron',
    everyMs: 24 * 60 * 60 * 1000,
    description: 'каждые 24 часа — снимок подписчиков по каналам',
  },
  {
    name: 'channels_refresh',
    jobId: 'channels_refresh_cron',
    everyMs: 24 * 60 * 60 * 1000,
    description: 'каждые 24 часа — refresh YouTube channel stats',
  },
  {
    name: 'videos_sync_all',
    jobId: 'videos_sync_all_cron',
    everyMs: 24 * 60 * 60 * 1000,
    description: 'каждые 24 часа — пуллинг новых видео и подтяжка delete/rename',
  },
  {
    name: 'comments_sync_recent',
    jobId: 'comments_sync_recent_cron',
    everyMs: 24 * 60 * 60 * 1000,
    description: 'каждые 24 часа — sync комментариев + classify',
  },
  {
    name: 'comment_auto_reply',
    jobId: 'comment_auto_reply_cron',
    everyMs: 30 * 60 * 1000,
    description: 'каждые 30 минут — auto-reply tick (готовит drafts + enqueue send)',
  },
  {
    name: 'transcript_embeddings_backfill',
    jobId: 'transcript_embeddings_backfill_cron',
    everyMs: 24 * 60 * 60 * 1000,
    description: 'каждые 24 часа — backfill pgvector эмбеддингов',
  },
]

export async function registerCronSchedules(queue: Queue): Promise<void> {
  for (const spec of SCHEDULES) {
    try {
      await queue.add(spec.name, {}, {
        repeat: { every: spec.everyMs },
        jobId: spec.jobId,
      })
      console.log(`[worker] cron ${spec.name}: ${spec.description}`)
    } catch (err) {
      // Don't fail boot on a single registration error — log and
      // continue so the other crons still get scheduled.
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[worker] cron registration failed for ${spec.name}: ${msg}`)
    }
  }
}
