import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { fal } from '@fal-ai/client'
import { compressArticleImage } from '@/lib/articles/image-compress'

export const maxDuration = 120

const DEFAULT_STYLE = `black and white woodcut engraving, dense crosshatching, fine parallel line work, deep shadows, high contrast, dark atmospheric mood, style of Gustave Doré, detailed ink illustration`

// Negative prompt — removes unwanted artifacts common in AI-generated images
const NEGATIVE_PROMPT = `white border, white frame, white margins, vignette, rounded corners, artist signature, watermark, text, letters, logo, paper texture, torn edges, frame within frame, decorative border, book cover layout`

interface CoverRequest {
  title: string
  description?: string
  customPrompt?: string
  style?: string
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    fal.config({ credentials: process.env.FAL_KEY ?? '' })
    const { title, description, customPrompt, style }: CoverRequest = await req.json()

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Укажите тему' }, { status: 400 })
    }

    const stylePrefix = style?.trim() || DEFAULT_STYLE
    const scene = customPrompt?.trim() || `${description || title}, wide cinematic composition, contemplative philosophical mood, abstract symbolism`
    const prompt = `${scene}, ${stylePrefix}, edge-to-edge composition filling entire canvas`

    // Using nano-banana (text-to-image, not edit variant)
    const runNano = () => fal.subscribe('fal-ai/nano-banana', {
      input: {
        prompt: `${prompt} NEGATIVE: ${NEGATIVE_PROMPT}`,
        aspect_ratio: '16:9',
        num_images: 1,
      } as any,
    }) as Promise<{ data?: { images?: Array<{ url: string }> }; images?: Array<{ url: string }> }>

    const results = await Promise.allSettled([runNano(), runNano()])
    const falUrls: string[] = []
    const errors: string[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const imgs = r.value?.data?.images ?? r.value?.images ?? []
        for (const img of imgs) if (img.url) falUrls.push(img.url)
      } else {
        errors.push(r.reason?.message ?? String(r.reason))
      }
    }

    if (falUrls.length === 0) {
      console.error('[cover] all generations failed:', errors)
      return NextResponse.json({ error: `Генерация не удалась: ${errors[0] ?? 'unknown'}` }, { status: 500 })
    }

    return NextResponse.json({ urls: falUrls, prompt })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка генерации'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// --- Persist fal.ai image to our storage ---

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { fal_url, article_id }: { fal_url: string; article_id: string } = await req.json()
    if (!fal_url || !article_id) {
      return NextResponse.json({ error: 'fal_url и article_id обязательны' }, { status: 400 })
    }

    // Download from fal.ai
    const imgRes = await fetch(fal_url)
    if (!imgRes.ok) throw new Error(`Fal.ai download failed: ${imgRes.status}`)
    const rawBuffer = Buffer.from(await imgRes.arrayBuffer())

    // Compress to <500KB (1280w, progressive mozjpeg)
    const buffer = await compressArticleImage(rawBuffer)
    console.log(`[cover] compressed: ${(rawBuffer.length/1024).toFixed(0)}KB → ${(buffer.length/1024).toFixed(0)}KB`)

    // Upload to Supabase storage
    const fileName = `articles/${article_id}/cover_${Date.now()}.jpg`

    // Ensure bucket exists
    const { data: buckets } = await supabaseAdmin.storage.listBuckets()
    const hasArticleBucket = buckets?.some(b => b.name === 'articles')
    if (!hasArticleBucket) {
      await supabaseAdmin.storage.createBucket('articles', { public: true })
    }

    const { error: uploadError } = await supabaseAdmin.storage
      .from('articles')
      .upload(fileName, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      })

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
