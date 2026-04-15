// Inline image generation for articles
// Generates image via fal.ai, downloads to Supabase storage, returns permanent URL

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { fal } from '@fal-ai/client'
import { compressArticleImage } from '@/lib/articles/image-compress'

export const maxDuration = 120

const STYLE_PREFIX = `black and white woodcut engraving illustration, dense crosshatching, fine parallel line work, high contrast ink art, deep shadows, contemplative philosophical mood, elegant editorial illustration style, classic book engraving technique. FULL-BLEED: image extends edge-to-edge filling the entire canvas with zero white space, zero border, zero margin, zero frame — illustration goes all the way to the pixel boundaries on every side`

const INLINE_NEGATIVE = `white border, white frame, white margins, white space around image, vignette, rounded corners, paper texture, torn edges, frame within frame, decorative border, text, letters, words, numbers, typography, captions, writing, labels, logo, signature, watermark, horror, scary, creepy, evil, gore, blood, skull, demon, monster, grotesque, faceless hooded figure, cult imagery, gothic horror`

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

    const fullPrompt = `${prompt}, ${STYLE_PREFIX} NEGATIVE: ${INLINE_NEGATIVE}`

    const result = await fal.subscribe('fal-ai/nano-banana', {
      input: {
        prompt: fullPrompt,
        aspect_ratio: '16:9',
        num_images: 1,
      } as any,
    }) as { data?: { images?: Array<{ url: string }> }; images?: Array<{ url: string }> }

    const images = result?.data?.images ?? result?.images ?? []
    const falUrl = images[0]?.url
    if (!falUrl) {
      return NextResponse.json({ error: 'Генерация не вернула изображение' }, { status: 500 })
    }

    // Download from fal.ai and upload to Supabase storage
    const imgRes = await fetch(falUrl)
    if (!imgRes.ok) throw new Error(`Download failed: ${imgRes.status}`)
    const rawBuffer = Buffer.from(await imgRes.arrayBuffer())
    const buffer = await compressArticleImage(rawBuffer)
    console.log(`[inline] compressed: ${(rawBuffer.length/1024).toFixed(0)}KB → ${(buffer.length/1024).toFixed(0)}KB`)

    const fileName = `articles/${article_id}/inline_${Date.now()}.jpg`

    const { data: buckets } = await supabaseAdmin.storage.listBuckets()
    if (!buckets?.some(b => b.name === 'articles')) {
      await supabaseAdmin.storage.createBucket('articles', { public: true })
    }

    const { error: uploadError } = await supabaseAdmin.storage
      .from('articles')
      .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabaseAdmin.storage
      .from('articles')
      .getPublicUrl(fileName)

    // Track in DB for management
    await supabaseAdmin.from('nl_article_images').insert({
      article_id,
      url: publicUrl,
      prompt,
    })

    return NextResponse.json({ url: publicUrl })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка генерации'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
