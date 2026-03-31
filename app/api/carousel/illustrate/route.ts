import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { supabaseAdmin } from '@/lib/supabase'
import type { CarouselSlide, CarouselStyle } from '@/lib/carousel/types'

export const maxDuration = 300

async function generateImage(prompt: string, referenceUrl?: string): Promise<string | null> {
  if (referenceUrl) {
    const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
      input: {
        prompt,
        image_urls: [referenceUrl],
        aspect_ratio: '4:5',
        resolution: '2K',
        num_images: 1,
        safety_tolerance: 5,
      } as any,
    }) as any
    return result?.data?.images?.[0]?.url ?? result?.images?.[0]?.url ?? null
  }

  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt,
      image_size: { width: 864, height: 1080 },
      num_images: 1,
    } as any,
  }) as any
  return result?.data?.images?.[0]?.url ?? result?.images?.[0]?.url ?? null
}

async function uploadToStorage(carouselId: string, imageUrl: string, name: string): Promise<string> {
  const imgRes = await fetch(imageUrl)
  const buffer = Buffer.from(await imgRes.arrayBuffer())

  const fileName = `${carouselId}/${name}_${Date.now()}.jpg`
  await supabaseAdmin.storage.from('thumbnails').upload(fileName, buffer, {
    contentType: 'image/jpeg',
    upsert: true,
  })

  const { data } = supabaseAdmin.storage.from('thumbnails').getPublicUrl(fileName)
  return data.publicUrl
}

export async function POST(req: NextRequest) {
  try {
    fal.config({ credentials: process.env.FAL_KEY ?? '' })

    const body = await req.json()
    const { carouselId, prompt, referenceUrl, slideIndex } = body

    if (!carouselId) {
      return NextResponse.json({ error: 'carouselId is required' }, { status: 400 })
    }

    const { data: carousel } = await supabaseAdmin
      .from('carousels')
      .select('slides, illustration_prompt, topic, style, illustration_urls')
      .eq('id', carouselId)
      .single()

    if (!carousel) {
      return NextResponse.json({ error: 'Carousel not found' }, { status: 404 })
    }

    const slides: CarouselSlide[] = carousel.slides ?? []
    const style: CarouselStyle | null = carousel.style
    const stylePrefix = style?.illustrationStyle ?? 'editorial ink illustration, minimal style'
    const styleSuffix = ', no text, no letters, no watermark, clean composition, vertical portrait orientation'

    // Mark as illustrating
    await supabaseAdmin.from('carousels').update({
      status: 'illustrating',
      updated_at: new Date().toISOString(),
    }).eq('id', carouselId)

    const illustrationUrls: Record<number, string> = { ...(carousel.illustration_urls ?? {}) }

    // Single slide mode
    if (slideIndex !== undefined && slideIndex !== null) {
      const slide = slides[slideIndex]
      const slidePrompt = prompt || slide?.illustrationPrompt || `${stylePrefix}, symbol related to ${slide?.title || carousel.topic}${styleSuffix}`
      const fullPrompt = `${stylePrefix}, ${slidePrompt}${styleSuffix}`

      console.log(`[carousel-illust] slide ${slideIndex} for ${carouselId}...`)
      const url = await generateImage(fullPrompt, referenceUrl)
      if (url) {
        const publicUrl = await uploadToStorage(carouselId, url, `slide_${slideIndex}`)
        illustrationUrls[slideIndex] = publicUrl
      }
    } else {
      // Batch mode — generate for all slides that have prompts
      const coverPrompt = prompt || carousel.illustration_prompt || `${stylePrefix}, scene about ${carousel.topic}${styleSuffix}`

      // Cover (slide 0)
      console.log(`[carousel-illust] cover for ${carouselId}...`)
      const coverUrl = await generateImage(`${stylePrefix}, ${coverPrompt}${styleSuffix}`, referenceUrl)
      if (coverUrl) {
        const publicUrl = await uploadToStorage(carouselId, coverUrl, 'cover')
        illustrationUrls[0] = publicUrl
      }

      // Content slides (parallel, max 3 concurrent)
      const contentSlides = slides
        .map((s, i) => ({ slide: s, index: i }))
        .filter(({ index }) => index > 0 && index < slides.length - 1 && slides[index].illustrationPrompt)

      // Process in batches of 3
      for (let batch = 0; batch < contentSlides.length; batch += 3) {
        const chunk = contentSlides.slice(batch, batch + 3)
        const results = await Promise.allSettled(
          chunk.map(async ({ slide, index }) => {
            const p = `${stylePrefix}, ${slide.illustrationPrompt}${styleSuffix}`
            console.log(`[carousel-illust] slide ${index} for ${carouselId}...`)
            const url = await generateImage(p)
            if (url) {
              const publicUrl = await uploadToStorage(carouselId, url, `slide_${index}`)
              return { index, url: publicUrl }
            }
            return null
          })
        )
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            illustrationUrls[r.value.index] = r.value.url
          }
        }
      }
    }

    // Save all illustration URLs
    await supabaseAdmin.from('carousels').update({
      illustration_url: illustrationUrls[0] ?? carousel.illustration_urls?.[0] ?? null,
      illustration_urls: illustrationUrls,
      status: 'ready',
      updated_at: new Date().toISOString(),
    }).eq('id', carouselId)

    console.log(`[carousel-illust] done: ${Object.keys(illustrationUrls).length} illustrations`)

    return NextResponse.json({
      success: true,
      urls: illustrationUrls,
      count: Object.keys(illustrationUrls).length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[carousel-illust]', message)

    // Reset status on error
    try {
      const { carouselId: cid } = await req.json()
      if (cid) {
        await supabaseAdmin.from('carousels').update({
          status: 'ready',
          updated_at: new Date().toISOString(),
        }).eq('id', cid)
      }
    } catch { /* ignore */ }

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
