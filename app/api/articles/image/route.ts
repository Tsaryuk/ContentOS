// Inline image generation for articles
// Generates image via fal.ai, downloads to Supabase storage, returns permanent URL

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { fal } from '@fal-ai/client'

export const maxDuration = 120

const STYLE_PREFIX = `Black and white woodcut engraving illustration. Extreme full-bleed composition, image extends beyond the frame on all sides, content is cropped by the edges. NO white borders, NO white margins, NO vignette, NO rounded corners, NO frame, NO signature, NO watermark, NO text, NO letters. Dense detailed crosshatching, fine parallel line work, deep shadows, high contrast. Editorial illustration style of classic book engravings like Gustave Doré.`

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

    const fullPrompt = `${prompt}, ${STYLE_PREFIX} NEGATIVE: white border, white frame, white margins, vignette, rounded corners, signature, watermark, text, letters, logo, paper texture, decorative border`

    const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
      input: {
        prompt: fullPrompt,
        aspect_ratio: '16:9',
        resolution: '2K',
        num_images: 1,
        safety_tolerance: 5,
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
    const buffer = Buffer.from(await imgRes.arrayBuffer())

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
