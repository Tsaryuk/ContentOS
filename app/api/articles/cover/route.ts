import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { fal } from '@fal-ai/client'

export const maxDuration = 120

const DEFAULT_STYLE = `Black and white woodcut engraving illustration. Extreme full-bleed composition, image extends beyond the frame on all sides, content is cropped by the edges. NO white borders, NO white margins, NO vignette, NO rounded corners, NO frame, NO signature, NO watermark, NO artist signature, NO text, NO letters, NO numbers. The black ink extends all the way to pixels 0,0 and 1280,720 with no padding. Dense detailed crosshatching, fine parallel line work, deep shadows, high contrast. Dark atmospheric philosophical mood. Editorial illustration style of classic book engravings like those of Gustave Doré. Cinematic crop where subject is close to viewer, environment fills all corners with dense linework.`

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
    const scene = customPrompt?.trim() || `Scene depicting the concept: "${description || title}". Wide cinematic composition, 16:9 aspect ratio. Mood: contemplative, philosophical, mysterious. More abstract symbolism than literal representation.`
    const prompt = `${stylePrefix} ${scene}`

    const result = await fal.subscribe('fal-ai/flux/dev', {
      input: {
        prompt,
        image_size: { width: 1280, height: 720 },
        num_images: 2,
        num_inference_steps: 28,
        guidance_scale: 3.5,
      },
    }) as { data?: { images?: Array<{ url: string }> }; images?: Array<{ url: string }> }

    const images = result?.data?.images ?? result?.images ?? []
    const falUrls = images.map(img => img.url).filter(Boolean)

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
    const buffer = Buffer.from(await imgRes.arrayBuffer())

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
