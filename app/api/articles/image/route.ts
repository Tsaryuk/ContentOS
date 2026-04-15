// Inline image generation — same fast flux/dev as cover

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { fal } from '@fal-ai/client'
import { compressArticleImage } from '@/lib/articles/image-compress'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const STYLE_PROMPT = `black and white woodcut engraving illustration, dense detailed crosshatching, fine parallel ink lines, stark high contrast, pure black ink on white paper, classical 19th-century book engraving in the style of Gustave Doré. Classical antiquity aesthetic — Greek marble, cosmic symbolism, ancient architecture, flames, waves, clouds.

CRITICAL: Full-bleed, image fills entire canvas edge-to-edge. Zero white borders, zero margins, zero frame, zero rounded corners. Black ink extends to every pixel edge.

No text, no letters, no numbers, no signatures, no watermarks, no horror, no hooded figures, no gore, no skulls.`

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

    const fullPrompt = `${prompt}\n\n${STYLE_PROMPT}`

    console.log('[inline] flux/dev starting, prompt:', prompt.slice(0, 80))
    const start = Date.now()

    const result = await fal.subscribe('fal-ai/flux/dev', {
      input: {
        prompt: fullPrompt,
        image_size: { width: 1280, height: 720 },
        num_images: 1,
        num_inference_steps: 28,
        guidance_scale: 3.5,
      } as any,
    }) as { data?: { images?: Array<{ url: string }> }; images?: Array<{ url: string }> }

    console.log(`[inline] done in ${((Date.now()-start)/1000).toFixed(1)}s`)

    const falUrl = (result?.data?.images ?? result?.images ?? [])[0]?.url
    if (!falUrl) {
      return NextResponse.json({ error: 'Модель не вернула изображения' }, { status: 500 })
    }

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
