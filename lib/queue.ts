import { Queue } from 'bullmq'
import IORedis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379'

let connection: IORedis | null = null

export function getRedisConnection(): IORedis {
  if (!connection) {
    connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })
  }
  return connection
}

let queue: Queue | null = null

export function getQueue(): Queue {
  if (!queue) {
    queue = new Queue('contentos', { connection: getRedisConnection() })
  }
  return queue
}

export type JobName =
  | 'transcribe'
  | 'generate'
  | 'thumbnail'
  | 'publish'
  | 'produce'
  | 'telegram_send'
  | 'newsletter_stats'
  | 'generate_short_title'
  | 'regenerate_timecodes'
  | 'comment_classify'
  | 'comment_draft'
  | 'comment_auto_reply'

export interface JobPayload {
  videoId?: string
  postId?: string
}
