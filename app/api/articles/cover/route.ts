// Cover generation for articles
// Uses fast flux/dev with detailed style instructions for consistent engraving look

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { fal } from '@fal-ai/client'
import { compressArticleImage } from '@/lib/articles/image-compress'
import { isAllowedUrl } from '@/lib/url-whitelist'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const STYLE_PROMPT = `Extreme close-up composition that EXTENDS BEYOND THE FRAME on all four sides — the scene overflows and is cropped by the canvas edges. The subject is so large it fills 100% of the image with no space around it. Black ink fills every corner, every edge pixel.

Style: dense black and white woodcut engraving, intricate crosshatching, fine parallel ink lines, stark high contrast, pure black ink on white paper. Classical 19th-century book engraving technique in the style of Gustave Doré. Classical antiquity: Greek marble busts, philosopher heads, ancient columns, cosmic spirals, galaxies, flames, waves.

ABSOLUTELY NO: white borders, white margins, white frame, torn paper edges, vignette, rounded corners, paper texture visible around the image, book cover layout, title card layout, signatures, watermarks, captions, text, letters, numbers, logos, horror imagery, hooded figures, gore, skulls.`

interface CoverRequest {
  title: string
  description?: string
  customPrompt?: string
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

    const scene = customPrompt?.trim()
      || `a symbolic classical scene about "${description || title}"`

    const prompt = `${scene}\n\n${STYLE_PROMPT}`

    console.log('[cover] flux/dev starting, scene:', scene.slice(0, 80))
    const start = Date.now()

    // 3 variants in one request — fast text-to-image
    const result = await fal.subscribe('fal-ai/flux/dev', {
      input: {
        prompt,
        image_size: { width: 1280, height: 720 },
        num_images: 3,
        num_inference_steps: 28,
        guidance_scale: 3.5,
      } as any,
    }) as { data?: { images?: Array<{ url: string }> }; images?: Array<{ url: string }> }

    console.log(`[cover] done in ${((Date.now()-start)/1000).toFixed(1)}s`)

    const imgs = result?.data?.images ?? result?.images ?? []
    const falUrls = imgs.map(i => i.url).filter(Boolean)

    if (falUrls.length === 0) {
      return NextResponse.json({ error: 'Модель не вернула изображений' }, { status: 500 })
    }

    return NextResponse.json({ urls: falUrls, prompt: scene })
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
