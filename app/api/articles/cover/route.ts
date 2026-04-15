// Cover generation for articles
// Uses nano-banana-2/edit with a permanent style reference image.
// Simple, fast, consistent style across all articles.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { fal } from '@fal-ai/client'
import { compressArticleImage } from '@/lib/articles/image-compress'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const STYLE_REF_URL = process.env.COVER_STYLE_REF_URL
  || 'https://alrdksqdiubcnodqssnr.supabase.co/storage/v1/object/public/articles/_style/cover-reference.jpg'

const STYLE_INSTRUCTIONS = `Match the exact visual style of the reference image: dense black and white woodcut engraving, extreme crosshatching, fine parallel ink lines, high contrast pure black and pure white (no grey). Classical antiquity imagery — Greek marble busts, philosopher heads, ancient architecture, cosmic symbolism, hands, open books, flames, waves.

CRITICAL: Full-bleed composition. Image must fill the entire canvas edge-to-edge with ZERO white borders, ZERO white margins, ZERO frames, ZERO rounded corners, ZERO paper texture. Black ink extends to every pixel edge.

Do NOT include text, letters, numbers, captions, signatures, watermarks, horror imagery, hooded figures, gore, or skulls.`

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

    // Scene: from custom prompt, or simple theme-based default
    const scene = customPrompt?.trim()
      || `a symbolic classical scene about "${description || title}"`

    const prompt = `${scene}\n\n${STYLE_INSTRUCTIONS}`

    console.log('[cover] starting nano-banana with scene:', scene.slice(0, 80))
    const start = Date.now()

    const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
      input: {
        prompt,
        image_urls: [STYLE_REF_URL],
        aspect_ratio: '16:9',
        resolution: '2K',
        num_images: 1,
        safety_tolerance: 5,
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
