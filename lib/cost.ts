/**
 * Cost tracking for paid AI / external API calls.
 *
 * Writes one row to `ai_usage` per call. Non-blocking (fire-and-forget) so
 * a failure to insert usage never breaks the actual work.
 *
 * Cost estimates come from a small price table below. They're best-effort —
 * provider pricing changes; keep this table up to date or wire a scheduled
 * reconciliation with billing APIs later. Null cost is OK — the dashboard
 * still counts units/tokens and flags missing prices.
 */

import { supabaseAdmin } from '@/lib/supabase'
import { logger } from '@/lib/logger'

export type Provider = 'anthropic' | 'openai' | 'fal' | 'recraft' | 'unisender'
export type Task =
  | 'transcribe' | 'produce' | 'generate' | 'thumbnail' | 'cover'
  | 'proofread' | 'clip_scoring' | 'short_title' | 'style_edit'
  | 'comments_draft' | 'carousel_generate' | 'newsletter_draft'
  | 'article_structure' | 'telegram_generate' | 'telegram_suggest'
  | 'content_ideas' | 'other'

export interface UsageEvent {
  provider: Provider
  model: string
  task?: Task | null
  inputTokens?: number
  outputTokens?: number
  units?: number           // e.g. images generated, audio-minutes
  videoId?: string | null
  postId?: string | null
  userId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Price table — matched by regex against the model name so both canonical
 * aliases (`claude-sonnet-4-5`) and API-specific IDs (`claude-sonnet-4-20250514`)
 * resolve to the same row. Order matters — first match wins.
 */
const PRICING: Array<{
  match: RegExp
  inPer1M?: number
  outPer1M?: number
  perUnit?: number
}> = [
  // Anthropic Claude 4.x
  { match: /^claude-opus-4/,     inPer1M: 15,  outPer1M: 75 },
  { match: /^claude-sonnet-4/,   inPer1M: 3,   outPer1M: 15 },
  { match: /^claude-haiku-4/,    inPer1M: 0.8, outPer1M: 4  },
  // Claude 3.5 legacy aliases
  { match: /^claude-3-5-sonnet/, inPer1M: 3,   outPer1M: 15 },
  { match: /^claude-3-5-haiku/,  inPer1M: 0.8, outPer1M: 4  },
  { match: /^claude-3-opus/,     inPer1M: 15,  outPer1M: 75 },

  // OpenAI audio (priced per audio minute)
  { match: /^whisper/,           perUnit: 0.006 },
  { match: /^gpt-4o-transcribe/, perUnit: 0.006 },

  // fal.ai image models
  { match: /^fal-ai\/nano-banana-2\/edit/, perUnit: 0.039 },
  { match: /^fal-ai\/flux\/dev/,           perUnit: 0.025 },

  // Recraft
  { match: /^recraft/, perUnit: 0.04 },
]

export function estimateCost(
  model: string,
  inputTokens?: number,
  outputTokens?: number,
  units?: number,
): number | null {
  const p = PRICING.find(row => row.match.test(model))
  if (!p) return null
  let cost = 0
  if (p.inPer1M  !== undefined && inputTokens)  cost += (inputTokens / 1_000_000) * p.inPer1M
  if (p.outPer1M !== undefined && outputTokens) cost += (outputTokens / 1_000_000) * p.outPer1M
  if (p.perUnit  !== undefined && units)        cost += units * p.perUnit
  return Number(cost.toFixed(6))
}

/**
 * Record a usage event. Fire-and-forget: insert failures only log, never throw.
 */
export function trackUsage(event: UsageEvent): void {
  const cost = estimateCost(
    event.model,
    event.inputTokens,
    event.outputTokens,
    event.units,
  )

  supabaseAdmin
    .from('ai_usage')
    .insert({
      provider:      event.provider,
      model:         event.model,
      task:          event.task ?? null,
      input_tokens:  event.inputTokens ?? null,
      output_tokens: event.outputTokens ?? null,
      units:         event.units ?? null,
      cost_usd:      cost,
      video_id:      event.videoId ?? null,
      post_id:       event.postId ?? null,
      user_id:       event.userId ?? null,
      metadata:      event.metadata ?? null,
    })
    .then(
      ({ error }) => {
        if (error) logger.warn({ err: error.message, event }, 'trackUsage insert failed')
      },
      (err) => logger.warn({ err: String(err), event }, 'trackUsage threw'),
    )
}
