import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { fal } from '@fal-ai/client'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'
import { compressArticleImage } from '@/lib/articles/image-compress'

const anthropic = new Anthropic()

export const maxDuration = 120

// Permanent style reference image — dense woodcut engraving of philosopher's head
// with galaxy emerging from mouth. Hosted in our Supabase storage.
// Set via env var so we can swap without redeploy.
const STYLE_REF_URL = process.env.COVER_STYLE_REF_URL
  || 'https://alrdksqdiubcnodqssnr.supabase.co/storage/v1/object/public/articles/_style/cover-reference.jpg'

const BASE_PROMPT = `Black and white woodcut engraving illustration, dense detailed crosshatching, fine parallel line work rendering every texture, stark high-contrast ink illustration in the tradition of Gustave Doré and classic 19th-century scientific engravings. Deep blacks, luminous whites, pure ink linework only — no grey fills, no color. Philosophical, contemplative, sublime mood. Antiquity aesthetic, classical Greek sculpture, cosmic symbolism.

COMPOSITION: Full-bleed filling the entire canvas edge-to-edge. Zero borders, zero margins, zero white space around the image. The black of the scene extends all the way to every pixel edge.`

const NEGATIVE = `white border, white frame, margins, vignette, rounded corners, paper texture, torn edges, frame within frame, book cover layout, title card, text, letters, words, numbers, typography, captions, writing, labels, logo, signature, watermark, color, grayscale, soft blurry, photograph, horror, gore, blood, demon, skull`

interface CoverRequest {
  title: string
  description?: string
  customPrompt?: string
  article_id?: string
}

// Ask Claude to generate a concrete scene description from article theme.
// Hard timeout 10s — if Claude is slow, use fallback template.
async function generateSceneDescription(title: string, description?: string): Promise<string> {
  const fallback = `classical Greek marble bust in profile, cosmic background with stars and a swirling galaxy, symbolic imagery related to "${title}"`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const response = await anthropic.messages.create({
      model: AI_MODELS.claudeLight ?? AI_MODELS.claude,
      max_tokens: 200,
      system: `You create concrete visual scene descriptions for black-and-white woodcut engraving cover illustrations in the style of antique philosophy books. Use classical antiquity imagery: Greek marble busts, philosopher heads, ancient columns, celestial bodies, cosmic symbolism, hands holding objects, open books, flames, waves, clouds, mountains. AVOID modern objects, horror, cults, hooded figures, skulls.

Return ONLY the scene description in English, 1-2 sentences, visual and concrete. No quotes, no preamble.`,
      messages: [{
        role: 'user',
        content: `Article: "${title}"${description ? `\nSubtitle: "${description}"` : ''}\n\nDescribe a single concrete visual scene.`,
      }],
    }, { signal: controller.signal })
    clearTimeout(timeout)

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()
      .replace(/^["«]|["»]$/g, '')

    return text || fallback
  } catch (err) {
    clearTimeout(timeout)
    console.warn('[cover] Claude scene gen failed, using fallback:', err instanceof Error ? err.message : String(err))
    return fallback
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

    // Generate scene from article (or use custom prompt if provided)
    const scene = customPrompt?.trim() || await generateSceneDescription(title, description)
    const prompt = `SCENE: ${scene}

${BASE_PROMPT}

NEGATIVE: ${NEGATIVE}`

    console.log('[cover] generating with scene:', scene.slice(0, 100))

    // nano-banana-2/edit with reference — request 2 variants in one call
    const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
      input: {
        prompt,
        image_urls: [STYLE_REF_URL],
        aspect_ratio: '16:9',
        resolution: '2K',
        num_images: 2,
        safety_tolerance: 5,
      } as any,
    }) as { data?: { images?: Array<{ url: string }> }; images?: Array<{ url: string }> }

    const imgs = result?.data?.images ?? result?.images ?? []
    const falUrls = imgs.map(i => i.url).filter(Boolean)

    if (falUrls.length === 0) {
      console.error('[cover] nano-banana returned no images')
      return NextResponse.json({ error: 'Генерация не вернула изображений' }, { status: 500 })
    }

    console.log(`[cover] got ${falUrls.length} variants`)
    return NextResponse.json({ urls: falUrls, prompt, scene })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка генерации'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// --- Persist fal.ai image to our storage with compression ---

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { fal_url, article_id }: { fal_url: string; article_id: string } = await req.json()
    if (!fal_url || !article_id) {
      return NextResponse.json({ error: 'fal_url и article_id обязательны' }, { status: 400 })
    }

    const imgRes = await fetch(fal_url)
    if (!imgRes.ok) throw new Error(`Fal.ai download failed: ${imgRes.status}`)
    const rawBuffer = Buffer.from(await imgRes.arrayBuffer())
    const buffer = await compressArticleImage(rawBuffer)
    console.log(`[cover] compressed: ${(rawBuffer.length/1024).toFixed(0)}KB → ${(buffer.length/1024).toFixed(0)}KB`)

    const fileName = `articles/${article_id}/cover_${Date.now()}.jpg`

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

    return NextResponse.json({ url: publicUrl })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
