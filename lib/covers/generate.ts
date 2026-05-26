// Universal cover generation engine. Reads a style row from cover_styles,
// fans out N parallel fal.ai calls (one per style variant), persists the
// raw URLs to cover_generations, and returns the row + variants.
//
// Stays out of HTTP concerns — route handlers wrap it with auth, rate-limit
// and request parsing. That separation lets us call the same engine from a
// worker job later (e.g. "auto-cover for newly published article").

import { fal } from '@fal-ai/client'
import { supabaseAdmin } from '@/lib/supabase'
import { trackUsage } from '@/lib/cost'

export type TargetKind =
  | 'article'
  | 'video'
  | 'newsletter'
  | 'telegram_post'
  | 'carousel'
  | 'podcast'

export type Aspect = '16:9' | '1:1' | '9:16' | '4:5' | '3:2'

// Default image dimensions per aspect. Kept here so callers don't have to
// pass widths; the style row only stores aspect ratio.
const ASPECT_TO_SIZE: Record<Aspect, { width: number; height: number }> = {
  '16:9': { width: 1280, height: 720 },
  '1:1': { width: 1024, height: 1024 },
  '9:16': { width: 720, height: 1280 },
  '4:5': { width: 1024, height: 1280 },
  '3:2': { width: 1200, height: 800 },
}

interface CoverStyleRow {
  id: string
  slug: string
  name: string
  scene_template: string
  variants: Array<{ kind: string; label: string; prompt: string }>
  negative_prompt: string | null
  model: string
  default_aspect: Aspect
}

export interface GeneratedVariant {
  kind: string
  label: string
  url: string
  prompt_head: string
}

export interface CoverGenerationResult {
  generationId: string
  variants: GeneratedVariant[]
  scene: string
  styleSlug: string
  styleName: string
}

export interface GenerateCoverInput {
  styleId: string
  targetKind: TargetKind
  targetId?: string | null
  projectId?: string | null
  title: string
  description?: string
  /** If set, overrides the style's scene_template entirely. */
  customScene?: string
  /** Overrides style.default_aspect. */
  aspect?: Aspect
  /** For trackUsage / audit. */
  createdBy?: string | null
}

function resolveSceneTemplate(template: string, title: string, description: string | undefined): string {
  // {scene} -> "title — description" (description optional). Keeps simple
  // template syntax: only one placeholder for now.
  const seed = description?.trim() ? `${title.trim()} — ${description.trim()}` : title.trim()
  return template.replace(/\{scene\}/g, seed)
}

function resolveVariantPrompt(
  variantPrompt: string,
  sceneResolved: string,
  negativePrompt: string | null,
): string {
  // Variant prompts may reference {scene_resolved}. We append the style's
  // negative_prompt as a separate sentence so it's preserved per-variant.
  const body = variantPrompt.replace(/\{scene_resolved\}/g, sceneResolved)
  if (!negativePrompt) return body
  return `${body} ${negativePrompt}`
}

async function runOneVariant(
  model: string,
  prompt: string,
  size: { width: number; height: number },
  variantMeta: { kind: string; label: string },
): Promise<GeneratedVariant | null> {
  try {
    const result = (await fal.subscribe(model, {
      input: {
        prompt,
        image_size: size,
        num_images: 1,
        num_inference_steps: 28,
        guidance_scale: 3.5,
      } as Record<string, unknown>,
    })) as { data?: { images?: Array<{ url: string }> }; images?: Array<{ url: string }> }

    const imgs = result?.data?.images ?? result?.images ?? []
    const url = imgs[0]?.url
    if (!url) return null
    return {
      kind: variantMeta.kind,
      label: variantMeta.label,
      url,
      prompt_head: prompt.slice(0, 80),
    }
  } catch (err) {
    console.error(
      `[covers] variant ${variantMeta.kind} failed:`,
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

/**
 * Generate cover variants for a given style + target. Returns the inserted
 * cover_generations row id plus the ephemeral fal.ai URLs. URLs expire in
 * ~24h; UI should call /api/covers/[id]/pick to persist a chosen one.
 */
export async function generateCover(input: GenerateCoverInput): Promise<CoverGenerationResult> {
  fal.config({ credentials: process.env.FAL_KEY ?? '' })

  const { data: style, error: styleErr } = await supabaseAdmin
    .from('cover_styles')
    .select('id, slug, name, scene_template, variants, negative_prompt, model, default_aspect')
    .eq('id', input.styleId)
    .eq('is_active', true)
    .maybeSingle<CoverStyleRow>()

  if (styleErr) throw new Error(`Style lookup failed: ${styleErr.message}`)
  if (!style) throw new Error('Стиль не найден или неактивен')

  if (!input.title?.trim()) throw new Error('Укажите заголовок')

  const sceneResolved =
    input.customScene?.trim() ||
    resolveSceneTemplate(style.scene_template, input.title, input.description)

  const aspect: Aspect = input.aspect ?? style.default_aspect
  const size = ASPECT_TO_SIZE[aspect] ?? ASPECT_TO_SIZE['16:9']

  const variantSpecs = Array.isArray(style.variants) && style.variants.length > 0
    ? style.variants
    : [{ kind: 'default', label: style.name, prompt: '{scene_resolved}' }]

  const start = Date.now()
  console.log(
    `[covers] style=${style.slug} variants=${variantSpecs.length} model=${style.model} scene=${sceneResolved.slice(0, 80)}`,
  )

  const settled = await Promise.all(
    variantSpecs.map((v) =>
      runOneVariant(
        style.model,
        resolveVariantPrompt(v.prompt, sceneResolved, style.negative_prompt),
        size,
        { kind: v.kind, label: v.label },
      ),
    ),
  )
  const variants = settled.filter((v): v is GeneratedVariant => v !== null)

  console.log(
    `[covers] done in ${((Date.now() - start) / 1000).toFixed(1)}s, ${variants.length}/${variantSpecs.length} succeeded`,
  )

  if (variants.length === 0) {
    throw new Error('Модель не вернула изображений ни для одного варианта')
  }

  trackUsage({
    provider: 'fal',
    model: style.model,
    task: 'cover',
    units: variants.length,
  })

  const { data: row, error: insertErr } = await supabaseAdmin
    .from('cover_generations')
    .insert({
      project_id: input.projectId ?? null,
      style_id: style.id,
      target_kind: input.targetKind,
      target_id: input.targetId ?? null,
      title: input.title,
      description: input.description ?? null,
      scene: sceneResolved,
      aspect,
      variants,
      status: 'ready',
      created_by: input.createdBy ?? null,
    })
    .select('id')
    .single()

  if (insertErr || !row) {
    throw new Error(`Не удалось сохранить генерацию: ${insertErr?.message ?? 'unknown'}`)
  }

  return {
    generationId: row.id,
    variants,
    scene: sceneResolved,
    styleSlug: style.slug,
    styleName: style.name,
  }
}
