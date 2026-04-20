// Cover generation for articles.
// Three distinct prompts produce three visually different covers while
// keeping the same overall engraving style — so the user picks the layout,
// not just the seed:
//   1. light — black-ink subject on pure white background, centered
//   2. dark  — white-ink subject on solid black background, centered
//   3. full  — subject bleeds to all four edges, 100% filled canvas
// Each variant is a separate fal call running in parallel; total wall time
// is ~one generation (~20-30s) instead of 3x sequential.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { fal } from '@fal-ai/client'
import { compressArticleImage } from '@/lib/articles/image-compress'
import { isAllowedUrl } from '@/lib/url-whitelist'
import { trackUsage } from '@/lib/cost'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const NEGATIVE = `ABSOLUTELY NO: text, letters, numbers, logos, signatures, watermarks, captions, frames, book-cover layouts, horror imagery, hooded figures, gore, skulls.`

type VariantKind = 'light' | 'dark' | 'full'

interface VariantSpec {
  kind: VariantKind
  label: string
  buildPrompt: (scene: string) => string
}

const VARIANTS: VariantSpec[] = [
  {
    kind: 'light',
    label: 'Светлая',
    buildPrompt: (scene) => `${scene}, rendered as a dense black-ink woodcut engraving in the style of Gustave Doré. Intricate crosshatching, fine parallel ink lines, stark high contrast, pure black ink on white paper. The subject is centered and fills about 60-70% of the canvas. The BACKGROUND IS PURE WHITE, clean and empty — white extends fully to all four edges of the image. No vignette, no border, no torn paper edge, no paper texture around the subject. Wide 16:9 cinematic composition. ${NEGATIVE}`,
  },
  {
    kind: 'dark',
    label: 'Тёмная',
    buildPrompt: (scene) => `${scene}, rendered in WHITE INK on a SOLID PURE BLACK BACKGROUND — inverted woodcut engraving, negative-print style, fine white parallel lines and white crosshatching on deep black, classical 19th-century engraving technique but in reverse print. Subject centered, fills about 60-70% of the canvas, glowing against the black. Background is uniform solid black, extends fully to all four edges. No vignette, no border. Wide 16:9 cinematic composition. ${NEGATIVE}`,
  },
  {
    kind: 'full',
    label: 'Полная гравюра',
    buildPrompt: (scene) => `Extreme close-up of ${scene} as a dense black-ink woodcut engraving that EXTENDS BEYOND THE FRAME on all four sides — the scene overflows and is cropped by the canvas edges. The subject is so large it fills 100% of the image with no space around it. Black ink fills every corner, every edge pixel. Intricate crosshatching, fine parallel ink lines, stark high contrast, Gustave Doré style. Wide 16:9 composition. ${NEGATIVE}`,
  },
]

interface CoverRequest {
  title: string
  description?: string
  customPrompt?: string
}

interface GeneratedVariant {
  kind: VariantKind
  label: string
  url: string
  prompt_head: string // first 80 chars of full prompt for debugging
}

async function generateVariant(
  spec: VariantSpec,
  scene: string,
): Promise<GeneratedVariant | null> {
  const prompt = spec.buildPrompt(scene)
  try {
    const result = (await fal.subscribe('fal-ai/flux/dev', {
      input: {
        prompt,
        image_size: { width: 1280, height: 720 },
        num_images: 1,
        num_inference_steps: 28,
        guidance_scale: 3.5,
      } as any,
    })) as { data?: { images?: Array<{ url: string }> }; images?: Array<{ url: string }> }

    const imgs = result?.data?.images ?? result?.images ?? []
    const url = imgs[0]?.url
    if (!url) return null
    return {
      kind: spec.kind,
      label: spec.label,
      url,
      prompt_head: prompt.slice(0, 80),
    }
  } catch (err) {
    console.error(`[cover] variant ${spec.kind} failed:`, err instanceof Error ? err.message : err)
    return null
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    fal.config({ credentials: process.env.FAL_KEY ?? '' })
    const { title, description, customPrompt }: CoverRequest = await req.json()

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Укажите тему' }, { status: 400 })
    }

    const scene = customPrompt?.trim() || `a symbolic classical scene about "${description || title}"`

    console.log('[cover] flux/dev 3x parallel starting, scene:', scene.slice(0, 80))
    const start = Date.now()

    const settled = await Promise.all(VARIANTS.map((v) => generateVariant(v, scene)))
    const variants = settled.filter((v): v is GeneratedVariant => v !== null)

    console.log(`[cover] done in ${((Date.now() - start) / 1000).toFixed(1)}s, ${variants.length}/${VARIANTS.length} succeeded`)

    if (variants.length === 0) {
      return NextResponse.json({ error: 'Модель не вернула изображений' }, { status: 500 })
    }

    trackUsage({
      provider: 'fal',
      model: 'fal-ai/flux/dev',
      task: 'cover',
      units: variants.length,
    })

    // Keep `urls` for backward compat with any existing callers; new shape is
    // `variants` with per-image label/kind that the UI shows under each thumb.
    return NextResponse.json({
      urls: variants.map((v) => v.url),
      variants: variants.map(({ kind, label, url }) => ({ kind, label, url })),
      prompt: scene,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка генерации'
    console.error('[cover] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// --- Persist fal.ai URL to our storage with compression ---

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { fal_url, article_id }: { fal_url: string; article_id: string } = await req.json()
    if (!fal_url || !article_id) {
      return NextResponse.json({ error: 'fal_url и article_id обязательны' }, { status: 400 })
    }
    if (!isAllowedUrl(fal_url)) {
      return NextResponse.json({ error: 'fal_url not in allow-list' }, { status: 400 })
    }

    const imgRes = await fetch(fal_url)
    if (!imgRes.ok) throw new Error(`Download failed: ${imgRes.status}`)
    const rawBuffer = Buffer.from(await imgRes.arrayBuffer())
    const buffer = await compressArticleImage(rawBuffer)
    console.log(`[cover] ${(rawBuffer.length/1024).toFixed(0)}KB → ${(buffer.length/1024).toFixed(0)}KB`)

    const fileName = `articles/${article_id}/cover_${Date.now()}.jpg`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('articles')
      .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('articles')
      .getPublicUrl(fileName)

    return NextResponse.json({ url: publicUrl })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
