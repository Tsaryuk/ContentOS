import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_KEY ?? '',
  )
}

export const maxDuration = 180

// Prompt variations for Nano Banana 2 Edit
const NANO_VARIANTS = [
  {
    name: 'Nano Banana A',
    suffix: 'Close-up emotional face showing surprise or curiosity. Text positioned top-left, very large and bold. High contrast between text and background.',
  },
  {
    name: 'Nano Banana B',
    suffix: 'Medium shot with dramatic side lighting. Text centered at bottom, clean and readable. Strong visual hierarchy.',
  },
  {
    name: 'Nano Banana C',
    suffix: 'Cinematic wide composition, moody dark atmosphere. Text with drop shadow, bottom-left. Editorial photography feel.',
  },
]

function buildNanoPrompt(params: {
  text: string
  guestInfo?: string
  photoCount: number
  refinement?: string
  variantSuffix: string
}): string {
  const { text, guestInfo, photoCount, refinement, variantSuffix } = params

  const layout = photoCount === 1
    ? 'One person from the reference photo, expressive emotional face.'
    : photoCount === 2
    ? 'Two people from the reference photos. Expressive emotional faces.'
    : photoCount >= 3
    ? 'Three people from the reference photos, emotional expressive faces.'
    : ''

  return [
    'YouTube podcast thumbnail, 1280x720, 16:9.',
    'Dark green-black gradient background.',
    layout,
    `Large bold Russian Cyrillic text: "${text}".`,
    'One key word highlighted in bright green (#4CAF50), rest white.',
    guestInfo ? `Guest: ${guestInfo}, name at bottom.` : '',
    'Professional podcast thumbnail, high contrast.',
    variantSuffix,
    refinement ? `IMPORTANT: ${refinement}` : '',
  ].filter(Boolean).join(' ')
}

async function runNanoBanana(
  prompt: string,
  imageUrls: string[],
  name: string,
): Promise<{ url: string | null; name: string }> {
  try {
    console.log(`[thumb] ${name}: starting with ${imageUrls.length} images...`)

    const input: Record<string, unknown> = {
      prompt,
      aspect_ratio: '16:9',
      resolution: '2K',
      num_images: 1,
      safety_tolerance: 5,
    }

    if (imageUrls.length > 0) {
      input.image_urls = imageUrls
    }

    const result = await fal.subscribe('fal-ai/nano-banana-2/edit', { input: input as any }) as any

    const url =
      result?.data?.images?.[0]?.url ??
      result?.images?.[0]?.url ??
      null

    console.log(`[thumb] ${name}: ${url ? 'OK' : 'no image'}`)
    return { url, name }
  } catch (err: any) {
    console.error(`[thumb] ${name} failed:`, err.message?.slice(0, 200))
    return { url: null, name }
  }
}

async function runYTThumbnails(
  text: string,
  photoUrl: string | undefined,
): Promise<{ url: string | null; name: string }> {
  const name = 'YT Thumbnails'
  try {
    console.log(`[thumb] ${name}: starting...`)

    const input: Record<string, unknown> = {
      image_url: photoUrl ?? 'https://fal.media/files/koala/QUihQrMqowYu30UFC_Atk.png',
      prompt: `${text}. Bold large Russian Cyrillic text overlay, green highlight on key word. Professional YouTube podcast thumbnail.`,
      guidance_scale: 5.0,
      num_inference_steps: 35,
      lora_scale: 0.8,
    }

    const result = await fal.subscribe('fal-ai/image-editing/youtube-thumbnails', { input: input as any }) as any

    const url =
      result?.data?.images?.[0]?.url ??
      result?.images?.[0]?.url ??
      result?.data?.image?.url ??
      null

    console.log(`[thumb] ${name}: ${url ? 'OK' : 'no image'}`)
    return { url, name }
  } catch (err: any) {
    console.error(`[thumb] ${name} failed:`, err.message?.slice(0, 200))
    return { url: null, name }
  }
}

export async function POST(req: NextRequest) {
  try {
    fal.config({ credentials: process.env.FAL_KEY ?? '' })
    const supabase = getSupabase()
    const body = await req.json()
    const { videoId, photos, text, referenceUrl, refinement, guestInfo } = body

    if (!videoId || !text) {
      return NextResponse.json({ error: 'videoId and text required' }, { status: 400 })
    }

    // Combine photos + reference into image_urls for Nano Banana
    const allImages = [
      ...(photos ?? []),
      ...(referenceUrl ? [referenceUrl] : []),
    ].filter(Boolean) as string[]

    console.log(`[thumb] Generating "${text}" | ${allImages.length} images | ${NANO_VARIANTS.length + 1} models...`)

    // Run all 4 in parallel: 3x Nano Banana + 1x YT Thumbnails
    const settled = await Promise.allSettled([
      ...NANO_VARIANTS.map(v =>
        runNanoBanana(
          buildNanoPrompt({
            text,
            guestInfo,
            photoCount: photos?.length ?? 0,
            refinement,
            variantSuffix: v.suffix,
          }),
          allImages,
          v.name,
        )
      ),
      runYTThumbnails(text, photos?.[0] ?? referenceUrl),
    ])

    const urls: string[] = []
    const modelNames: string[] = []

    for (const r of settled) {
      if (r.status !== 'fulfilled' || !r.value.url) continue

      try {
        const imgRes = await fetch(r.value.url)
        const imgBuf = Buffer.from(await imgRes.arrayBuffer())
        const slug = r.value.name.toLowerCase().replace(/\s+/g, '_')
        const fileName = `${videoId}/gen_${slug}_${Date.now()}.jpg`

        await supabase.storage.from('thumbnails').upload(fileName, imgBuf, {
          contentType: 'image/jpeg', upsert: true,
        })
        const { data } = supabase.storage.from('thumbnails').getPublicUrl(fileName)
        urls.push(data.publicUrl)
        modelNames.push(r.value.name)
      } catch (err: any) {
        console.error(`[thumb] ${r.value.name} upload:`, err.message)
      }
    }

    // Save to DB
    if (urls.length > 0) {
      const { data: video } = await supabase.from('yt_videos')
        .select('producer_output').eq('id', videoId).single()

      const po = video?.producer_output
        ? { ...video.producer_output, thumbnail_urls: urls }
        : { thumbnail_urls: urls }

      await supabase.from('yt_videos').update({
        thumbnail_url: urls[0], producer_output: po,
        updated_at: new Date().toISOString(),
      }).eq('id', videoId)
    }

    return NextResponse.json({
      success: true, urls, models: modelNames,
    })
  } catch (err: any) {
    console.error('[thumb-gen]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
