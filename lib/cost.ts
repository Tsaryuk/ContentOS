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

// USD per 1M tokens (input / output), per image, per minute etc.
// Update when provider pricing changes.
const PRICING: Record<string, { inPer1M?: number; outPer1M?: number; perUnit?: number }> = {
  // Anthropic Claude — 2025 pricing
  'claude-opus-4-5': { inPer1M: 15, outPer1M: 75 },
  'claude-sonnet-4-5': { inPer1M: 3, outPer1M: 15 },
  'claude-sonnet-4-6': { inPer1M: 3, outPer1M: 15 },
  'claude-haiku-4-5': { inPer1M: 0.8, outPer1M: 4 },

  // OpenAI
  'whisper-1': { perUnit: 0.006 }, // $0.006 / minute of audio
  'gpt-4o-transcribe': { perUnit: 0.006 },

  // fal.ai (approximate per-image pricing)
  'fal-ai/nano-banana-2/edit': { perUnit: 0.039 },
  'fal-ai/flux/dev': { perUnit: 0.025 },

  // Recraft
  'recraft-v3': { perUnit: 0.04 },
}

export function estimateCost(
  model: string,
  inputTokens?: number,
  outputTokens?: number,
  units?: number,
): number | null {
  const p = PRICING[model]
  if (!p) return null
  let cost = 0
  if (p.inPer1M !== undefined && inputTokens) cost += (inputTokens / 1_000_000) * p.inPer1M
  if (p.outPer1M !== undefined && outputTokens) cost += (outputTokens / 1_000_000) * p.outPer1M
  if (p.perUnit !== undefined && units)   cost += units * p.perUnit
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
