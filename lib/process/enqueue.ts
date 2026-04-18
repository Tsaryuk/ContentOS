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

export async function enqueueProcessJob(
  task: string,
  videoId: string,
  data: Record<string, unknown>,
  opts: JobsOptions = { attempts: 1 },
): Promise<EnqueueResult> {
  const queue = getQueue()
  const jobId = `${task}:${videoId}`
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

  await queue.add(task, data, { ...opts, jobId })
  return { status: 'queued' }
}
