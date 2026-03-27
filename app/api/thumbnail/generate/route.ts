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

// 4 emotion/composition variants for Nano Banana 2 Edit
const VARIANTS = [
  {
    name: 'Shock',
    emotion: 'shocked, eyes wide open, mouth slightly open, genuine surprise',
    composition: 'Face occupies 60% of frame, slightly off-center right. Text top-left.',
  },
  {
    name: 'Intense',
    emotion: 'intense focused stare, furrowed brows, determined expression',
    composition: 'Face occupies 55% of frame, centered-right. Text bottom-left.',
  },
  {
    name: 'Confident',
    emotion: 'confident slight smirk, one eyebrow raised, self-assured look',
    composition: 'Face occupies 50% of frame, right side. Text left-center.',
  },
  {
    name: 'Serious',
    emotion: 'serious contemplative expression, piercing direct eye contact',
    composition: 'Face occupies 65% of frame, close-up right. Text top-left overlapping slightly.',
  },
]

function buildMasterPrompt(params: {
  textLine1: string       // white text (context/number)
  textLine2: string       // green text (emotional word)
  guestName?: string
  emotion: string
  composition: string
  photoCount: number
  refinement?: string
}): string {
  const { textLine1, textLine2, guestName, emotion, composition, photoCount, refinement } = params

  const peopleLayout = photoCount <= 1
    ? `One person from the reference photo, looking directly at camera. ${emotion}.`
    : photoCount === 2
    ? `Two people from reference photos. Guest on left with ${emotion}. Host on right. Both looking at camera.`
    : `Multiple people from reference photos. Main guest prominent with ${emotion}. All facing camera.`

  return [
    // Core format
    'YouTube podcast thumbnail. 1280x720, 16:9 aspect ratio.',

    // Background & style — match reference
    'Match the exact layout and color palette from the reference image.',
    'Same composition style, same background treatment.',
    'Only change the face and text content.',
    'Dark moody background with subtle dark green tones.',
    'Cinematic studio lighting, high contrast, editorial photography.',

    // People
    peopleLayout,
    composition,
    'Eyes looking directly at camera. Face must be photorealistic.',

    // Text — Russian, 2 lines
    `Large bold text, two lines:`,
    `Line 1 (white color, bold): "${textLine1}"`,
    `Line 2 (bright green #4CAF50, bold): "${textLine2}"`,
    'Text must be clearly readable at 160x90px preview size.',
    'Maximum 3 words total on the thumbnail.',
    'Font style: bold sans-serif, slightly condensed.',

    // Guest info
    guestName ? `Small text at bottom: "${guestName}" in white, subtle.` : '',

    // Constraints
    'No logos, no watermarks, no extra UI elements.',
    'No English text. All text must be in Russian Cyrillic.',
    'Dark background ensures text contrast.',
    'Professional YouTube podcast thumbnail quality.',

    // Refinement
    refinement ? `IMPORTANT MODIFICATION: ${refinement}` : '',
  ].filter(Boolean).join(' ')
}

function splitText(text: string): { line1: string; line2: string } {
  // Try to split at — or -
  const dashSplit = text.split(/\s*[—–-]\s*/)
  if (dashSplit.length >= 2) {
    return { line1: dashSplit[0].trim(), line2: dashSplit.slice(1).join(' ').trim() }
  }
  // Split at midpoint by words
  const words = text.split(/\s+/)
  if (words.length >= 3) {
    const mid = Math.ceil(words.length / 2)
    return { line1: words.slice(0, mid).join(' '), line2: words.slice(mid).join(' ') }
  }
  if (words.length === 2) {
    return { line1: words[0], line2: words[1] }
  }
  return { line1: text, line2: '' }
}

async function runNanoBanana(
  prompt: string,
  imageUrls: string[],
  name: string,
): Promise<{ url: string | null; name: string }> {
  try {
    console.log(`[thumb] ${name}: starting with ${imageUrls.length} ref images...`)

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
    console.error(`[thumb] ${name} failed:`, err.message?.slice(0, 300))
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

    // Split text into 2 lines: white + green
    const { line1, line2 } = splitText(text)

    // Reference images: photos first, then reference style image
    // Reference is used ONLY for layout/style, NOT for content
    const imageUrls = [
      ...(photos ?? []),
      ...(referenceUrl ? [referenceUrl] : []),
    ].filter(Boolean) as string[]

    console.log(`[thumb] "${line1} / ${line2}" | ${imageUrls.length} images | 4 variants...`)

    // Run 4 Nano Banana variants in parallel
    const settled = await Promise.allSettled(
      VARIANTS.map(v =>
        runNanoBanana(
          buildMasterPrompt({
            textLine1: line1,
            textLine2: line2,
            guestName: guestInfo,
            emotion: v.emotion,
            composition: v.composition,
            photoCount: photos?.length ?? 0,
            refinement,
          }),
          imageUrls,
          v.name,
        )
      )
    )

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

    return NextResponse.json({ success: true, urls, models: modelNames })
  } catch (err: any) {
    console.error('[thumb-gen]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
