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

// 4 models: each handles photos + text differently
const MODELS: {
  id: string
  name: string
  build: (p: GenParams) => Record<string, unknown>
}[] = [
  {
    id: 'fal-ai/nano-banana-2',
    name: 'Nano Banana 2',
    build: (p) => ({
      prompt: p.fullPrompt,
      image_size: { width: 1280, height: 720 },
      num_images: 1,
    }),
  },
  {
    id: 'fal-ai/image-editing/youtube-thumbnails',
    name: 'YT Thumbnails',
    build: (p) => ({
      image_url: p.photoUrl ?? p.refUrl ?? 'https://fal.media/files/koala/QUihQrMqowYu30UFC_Atk.png',
      prompt: p.text,
      guidance_scale: 4.0,
      num_inference_steps: 35,
      lora_scale: 0.6,
    }),
  },
  {
    id: 'fal-ai/flux-pro/v1.1',
    name: 'Flux 2 Pro',
    build: (p) => ({
      prompt: p.fullPrompt,
      image_size: { width: 1360, height: 768 },
      num_images: 1,
    }),
  },
  {
    id: 'fal-ai/ideogram/v2/turbo',
    name: 'Ideogram',
    build: (p) => ({
      prompt: p.fullPrompt,
      image_size: { width: 1280, height: 720 },
      num_images: 1,
    }),
  },
]

interface GenParams {
  text: string
  fullPrompt: string
  photoUrl?: string
  refUrl?: string
}

function buildPrompt(params: {
  text: string
  photoCount: number
  refinement?: string
  guestInfo?: string
}): string {
  const { text, photoCount, refinement, guestInfo } = params

  const layout = photoCount === 1
    ? 'One person on the right side, expressive emotional face, looking at camera.'
    : photoCount === 2
    ? 'Two people: left and right. Expressive emotional faces, real emotions.'
    : photoCount >= 3
    ? 'Three people across the frame, emotional expressive faces.'
    : ''

  return [
    `YouTube podcast thumbnail, 1280x720.`,
    `Dark green-black gradient background, cinematic moody lighting.`,
    layout,
    `Large bold Russian Cyrillic text: "${text}".`,
    `One key word highlighted in bright green (#4CAF50), rest white.`,
    `Professional podcast thumbnail style, high contrast.`,
    guestInfo ? `Guest: ${guestInfo}, name shown at bottom.` : '',
    `Emotional faces that boost CTR. Clean composition.`,
    refinement ? `MODIFICATION: ${refinement}` : '',
  ].filter(Boolean).join(' ')
}

async function runModel(
  model: typeof MODELS[0],
  params: GenParams,
): Promise<string | null> {
  try {
    const input = model.build(params)
    console.log(`[thumb] ${model.name}: starting...`)

    const result = await fal.subscribe(model.id, { input: input as any }) as any

    const url =
      result?.data?.images?.[0]?.url ??
      result?.images?.[0]?.url ??
      result?.data?.output?.images?.[0]?.url ??
      result?.data?.image?.url ??
      null

    if (url) console.log(`[thumb] ${model.name}: OK`)
    else console.log(`[thumb] ${model.name}: no image in response`)

    return url
  } catch (err: any) {
    console.error(`[thumb] ${model.name} failed:`, err.message?.slice(0, 200))
    return null
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

    const fullPrompt = buildPrompt({
      text,
      photoCount: photos?.length ?? 0,
      refinement,
      guestInfo,
    })

    const params: GenParams = {
      text,
      fullPrompt,
      photoUrl: photos?.[0],
      refUrl: referenceUrl,
    }

    console.log(`[thumb] Generating "${text}" with ${MODELS.length} models...`)

    // Run all 4 in parallel
    const settled = await Promise.allSettled(
      MODELS.map(m => runModel(m, params))
    )

    const urls: string[] = []
    const modelNames: string[] = []

    for (let i = 0; i < settled.length; i++) {
      const r = settled[i]
      if (r.status !== 'fulfilled' || !r.value) continue

      try {
        const imgRes = await fetch(r.value)
        const imgBuf = Buffer.from(await imgRes.arrayBuffer())
        const slug = MODELS[i].name.toLowerCase().replace(/\s+/g, '_')
        const fileName = `${videoId}/gen_${slug}_${Date.now()}.jpg`

        await supabase.storage.from('thumbnails').upload(fileName, imgBuf, {
          contentType: 'image/jpeg', upsert: true,
        })
        const { data } = supabase.storage.from('thumbnails').getPublicUrl(fileName)
        urls.push(data.publicUrl)
        modelNames.push(MODELS[i].name)
      } catch (err: any) {
        console.error(`[thumb] ${MODELS[i].name} upload:`, err.message)
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
      prompt: fullPrompt.slice(0, 200) + '...',
    })
  } catch (err: any) {
    console.error('[thumb-gen]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
