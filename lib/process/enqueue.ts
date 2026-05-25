/**
 * Shared helper for enqueueing process jobs with idempotency.
 *
 * Uses a deterministic jobId (`<task>:<videoId>`) so double-clicking or
 * retrying the request doesn't enqueue duplicate work. Cleans up stale
 * completed/failed jobs so their jobId can be reused.
 */

import type { JobsOptions } from 'bullmq'
import { getQueue } from '@/lib/queue'

export interface EnqueueResult {
  status: 'queued' | 'already_queued'
}

export interface EnqueueOptions extends JobsOptions {
  /**
   * Force a fresh BullMQ jobId even if a matching one already exists.
   * Use this when an in-flight handler wants to schedule its own
   * continuation — without `force`, the idempotency check silently
   * drops the continuation because the *current* job is still active
   * and matches the deterministic jobId.
   *
   * Example: handleProduce sees no transcript, enqueues `transcribe`
   * + `produce` (delayed 120s) and returns. The delayed `produce` had
   * the same jobId as the one currently running, so the second add
   * was swallowed and the video stayed stuck in `generating` once
   * transcribe finished.
   */
  force?: boolean
}

export async function enqueueProcessJob(
  task: string,
  videoId: string,
  data: Record<string, unknown>,
  opts: EnqueueOptions = { attempts: 1 },
): Promise<EnqueueResult> {
  const queue = getQueue()
  // BullMQ v5 rejects ':' in custom job ids ("Custom Id cannot contain :").
  // Use '--' as the separator instead.
  //
  // For `force` callers we append a timestamp+random suffix so the
  // continuation has a distinct id from the currently-active job —
  // BullMQ would otherwise drop the add as a duplicate.
  const baseId = `${task}--${videoId}`
  const { force, ...jobOpts } = opts
  const jobId = force
    ? `${baseId}--retry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    : baseId

  if (!force) {
    const existing = await queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'active' || state === 'waiting' || state === 'delayed') {
        return { status: 'already_queued' }
      }
      // completed / failed / unknown — remove so BullMQ accepts the new job
      // with the same id. Otherwise queue.add() throws "Duplicate job id".
      try {
        await existing.remove()
      } catch {
        // Racing with another worker finishing the same job — fine to ignore.
      }
    }
  }

  await queue.add(task, data, { ...jobOpts, jobId })
  return { status: 'queued' }
}
