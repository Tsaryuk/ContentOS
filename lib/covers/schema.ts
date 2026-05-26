// Shared Zod schemas for cover styles. Co-located with the rest of the
// covers domain rather than the route file because Next.js route modules
// only allow specific named exports (HTTP method handlers + the few
// well-known config fields).

import { z } from 'zod'

export const TARGET_KINDS = [
  'article',
  'video',
  'newsletter',
  'telegram_post',
  'carousel',
  'podcast',
] as const

export const ASPECTS = ['16:9', '1:1', '9:16', '4:5', '3:2'] as const

export const variantSchema = z.object({
  kind: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  prompt: z.string().min(1).max(4000),
})

export const styleBodySchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, 'slug: только a-z0-9-'),
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  scene_template: z.string().min(1).max(2000),
  variants: z.array(variantSchema).min(1).max(8),
  negative_prompt: z.string().max(2000).nullable().optional(),
  model: z.string().min(1).max(120).default('fal-ai/flux/dev'),
  default_aspect: z.enum(ASPECTS).default('16:9'),
  brand_palette: z.array(z.string().regex(/^#[0-9a-fA-F]{3,8}$/)).max(12).default([]),
  target_kinds: z.array(z.enum(TARGET_KINDS)).default([]),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(10000).default(0),
})

export type CoverStyleBody = z.infer<typeof styleBodySchema>

export const styleUpdateSchema = styleBodySchema.partial()
export type CoverStyleUpdate = z.infer<typeof styleUpdateSchema>
