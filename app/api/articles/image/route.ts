// Inline image generation for articles.
// Uses nano-banana-2/edit with the same reference as cover for consistent style.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { fal } from '@fal-ai/client'
import { compressArticleImage } from '@/lib/articles/image-compress'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const STYLE_REF_URL = process.env.COVER_STYLE_REF_URL
  || 'https://alrdksqdiubcnodqssnr.supabase.co/storage/v1/object/public/articles/_style/cover-reference.jpg'

const STYLE_INSTRUCTIONS = `Match the exact visual style of the reference image: dense black and white woodcut engraving, extreme crosshatching, fine parallel ink lines, high contrast pure black and pure white (no grey). Classical antiquity imagery.

CRITICAL: Full-bleed composition. Image must fill the entire canvas edge-to-edge with ZERO white borders, ZERO white margins, ZERO frames, ZERO rounded corners, ZERO paper texture. Black ink extends to every pixel edge.

Do NOT include text, letters, numbers, captions, signatures, watermarks, horror imagery, hooded figures, gore, or skulls.`

interface ImageRequest {
  article_id: string
  prompt: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    fal.config({ credentials: process.env.FAL_KEY ?? '' })
    const { article_id, prompt }: ImageRequest = await req.json()

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Укажите промпт' }, { status: 400 })
    }
    if (!article_id) {
      return NextResponse.json({ error: 'article_id обязателен' }, { status: 400 })
    }

    const fullPrompt = `${prompt}\n\n${STYLE_INSTRUCTIONS}`

    console.log('[inline] starting nano-banana with prompt:', prompt.slice(0, 80))
    const start = Date.now()

    const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
      input: {
        prompt: fullPrompt,
        image_urls: [STYLE_REF_URL],
        aspect_ratio: '16:9',
        resolution: '2K',
        num_images: 1,
        safety_tolerance: 5,
      } as any,
    }) as { data?: { images?: Array<{ url: string }> }; images?: Array<{ url: string }> }

    console.log(`[inline] done in ${((Date.now()-start)/1000).toFixed(1)}s`)

    const falUrl = (result?.data?.images ?? result?.images ?? [])[0]?.url
    if (!falUrl) {
      return NextResponse.json({ error: 'Модель не вернула изображения' }, { status: 500 })
    }

    // Download, compress, upload
    const imgRes = await fetch(falUrl)
    if (!imgRes.ok) throw new Error(`Download failed: ${imgRes.status}`)
    const rawBuffer = Buffer.from(await imgRes.arrayBuffer())
    const buffer = await compressArticleImage(rawBuffer)
    console.log(`[inline] ${(rawBuffer.length/1024).toFixed(0)}KB → ${(buffer.length/1024).toFixed(0)}KB`)

    const fileName = `articles/${article_id}/inline_${Date.now()}.jpg`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('articles')
      .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('articles')
      .getPublicUrl(fileName)

    // Track in DB
    await supabaseAdmin.from('nl_article_images').insert({
      article_id,
      url: publicUrl,
      prompt,
    })

    return NextResponse.json({ url: publicUrl })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка генерации'
    console.error('[inline] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
