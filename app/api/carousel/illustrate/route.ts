import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    fal.config({ credentials: process.env.FAL_KEY ?? '' })

    const body = await req.json()
    const { carouselId, prompt, style, referenceUrl } = body

    if (!carouselId) {
      return NextResponse.json({ error: 'carouselId is required' }, { status: 400 })
    }

    // Get carousel for prompt if not provided directly
    let illustrationPrompt = prompt
    if (!illustrationPrompt) {
      const { data: carousel } = await supabaseAdmin
        .from('carousels')
        .select('illustration_prompt, topic')
        .eq('id', carouselId)
        .single()

      illustrationPrompt = carousel?.illustration_prompt
        ?? `editorial illustration about ${carousel?.topic}, minimal ink style, warm off-white background`
    }

    const fullPrompt = [
      illustrationPrompt,
      'editorial illustration, minimal ink style, warm off-white background',
      'no text, no watermark, no words, no letters',
      'clean composition, professional quality',
      style === 'vector' ? 'vector illustration, flat design' : '',
      style === 'realistic' ? 'realistic painting, detailed brushwork' : '',
    ].filter(Boolean).join(', ')

    console.log(`[carousel-illust] generating for ${carouselId}, hasRef=${!!referenceUrl}...`)

    let imageUrl: string | null = null

    if (referenceUrl) {
      // img2img: use nano-banana with reference
      const result = await fal.subscribe('fal-ai/nano-banana-2/edit', {
        input: {
          prompt: fullPrompt,
          image_urls: [referenceUrl],
          aspect_ratio: '4:5',
          resolution: '2K',
          num_images: 1,
          safety_tolerance: 5,
        } as any,
      }) as any

      imageUrl = result?.data?.images?.[0]?.url ?? result?.images?.[0]?.url ?? null
    } else {
      // text-to-image: use flux (no reference needed)
      const result = await fal.subscribe('fal-ai/flux/schnell', {
        input: {
          prompt: fullPrompt,
          image_size: { width: 864, height: 1080 },
          num_images: 1,
        } as any,
      }) as any

      imageUrl = result?.data?.images?.[0]?.url ?? result?.images?.[0]?.url ?? null
    }

    if (!imageUrl) {
      throw new Error('fal-ai returned no image')
    }

    // Download and upload to Supabase Storage
    const imgRes = await fetch(imageUrl)
    const buffer = Buffer.from(await imgRes.arrayBuffer())

    const fileName = `${carouselId}/illustration_${Date.now()}.jpg`
    await supabaseAdmin.storage.from('thumbnails').upload(fileName, buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    })

    const { data: urlData } = supabaseAdmin.storage
      .from('thumbnails')
      .getPublicUrl(fileName)

    const publicUrl = urlData.publicUrl

    // Update carousel
    await supabaseAdmin.from('carousels').update({
      illustration_url: publicUrl,
      updated_at: new Date().toISOString(),
    }).eq('id', carouselId)

    console.log(`[carousel-illust] done: ${publicUrl}`)

    return NextResponse.json({ success: true, url: publicUrl })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[carousel-illust]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
