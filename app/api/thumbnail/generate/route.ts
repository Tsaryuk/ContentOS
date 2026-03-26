import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_KEY ?? '',
  )
}

function initFal() {
  fal.config({ credentials: process.env.FAL_KEY ?? '' })
}

export const maxDuration = 120

// 4 models to generate in parallel
const MODELS = [
  { id: 'fal-ai/flux/dev/image-to-image', name: 'Flux' },
  { id: 'fal-ai/flux-pro/v1.1', name: 'Flux Pro' },
  { id: 'fal-ai/recraft-v3', name: 'Recraft v3' },
  { id: 'fal-ai/ideogram/v2/turbo', name: 'Ideogram' },
]

function buildPrompt(params: {
  text: string
  guestInfo?: string
  photoCount: number
  refinement?: string
  channelStyle?: string
}): string {
  const { text, guestInfo, photoCount, refinement, channelStyle } = params

  const layout = photoCount === 1
    ? 'One person prominently on the right side of the frame, looking at camera with expressive emotional face. Genuine reaction, engaged expression.'
    : photoCount === 2
    ? 'Two people: guest on the left, host on the right. Both with expressive emotional faces — surprised, thoughtful, or passionate. Real emotions, not posed.'
    : photoCount >= 3
    ? 'Three people arranged across the frame, all with expressive emotional faces. Dynamic expressions that draw attention.'
    : 'Dark atmospheric background.'

  const style = channelStyle || [
    'Dark green-black gradient background.',
    'Cinematic moody lighting with subtle green accent.',
    'Professional YouTube podcast thumbnail style.',
    'High contrast, editorial photography feel.',
    'Faces must show real emotions: surprise, curiosity, passion, concern. Emotions boost CTR.',
  ].join(' ')

  const parts = [
    `YouTube podcast thumbnail, 1280x720, 16:9 aspect ratio.`,
    style,
    layout,
    `Bold large Russian text overlaid: "${text}"`,
    `One word in the text is highlighted in bright green (#4CAF50), rest is white.`,
    guestInfo ? `Guest: ${guestInfo}. Show name and title at the bottom.` : '',
    `Duration badge "1:22:11" style in bottom-right corner.`,
    `Clean professional composition, no clutter.`,
    refinement ? `IMPORTANT modification: ${refinement}` : '',
  ]

  return parts.filter(Boolean).join(' ')
}

async function generateWithModel(
  modelId: string,
  prompt: string,
  imageUrl?: string,
): Promise<string | null> {
  try {
    const input: Record<string, unknown> = {
      prompt,
      num_images: 1,
      image_size: { width: 1360, height: 768 },
    }

    // image-to-image models need image_url
    if (imageUrl && modelId.includes('image-to-image')) {
      input.image_url = imageUrl
      input.strength = 0.6
    }

    // For text-to-image models, just prompt
    if (modelId === 'fal-ai/recraft-v3') {
      input.style = 'realistic_image'
      input.image_size = { width: 1365, height: 1024 }
    }

    const result = await fal.subscribe(modelId, { input: input as any }) as any

    // Different models return images in different structures
    const url =
      result?.data?.images?.[0]?.url ??
      result?.images?.[0]?.url ??
      result?.data?.output?.images?.[0]?.url ??
      null

    return url
  } catch (err: any) {
    console.error(`[thumbnail] ${modelId} failed:`, err.message)
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    initFal()
    const supabase = getSupabase()
    const body = await req.json()
    const { videoId, photos, text, referenceUrl, refinement, guestInfo, channelStyle } = body

    if (!videoId || !text) {
      return NextResponse.json({ error: 'videoId and text required' }, { status: 400 })
    }

    const prompt = buildPrompt({
      text,
      guestInfo,
      photoCount: photos?.length ?? 0,
      refinement,
      channelStyle,
    })

    console.log(`[thumbnail] Generating for "${text}" with ${MODELS.length} models...`)

    // Generate from all 4 models in parallel
    const imageUrl = referenceUrl || photos?.[0] || undefined
    const results = await Promise.allSettled(
      MODELS.map(m => generateWithModel(m.id, prompt, imageUrl))
    )

    const urls: string[] = []
    const modelNames: string[] = []

    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      if (r.status !== 'fulfilled' || !r.value) continue

      try {
        const imgRes = await fetch(r.value)
        const imgBuf = Buffer.from(await imgRes.arrayBuffer())
        const fileName = `${videoId}/gen_${MODELS[i].name.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.jpg`

        await supabase.storage.from('thumbnails').upload(fileName, imgBuf, {
          contentType: 'image/jpeg',
          upsert: true,
        })

        const { data } = supabase.storage.from('thumbnails').getPublicUrl(fileName)
        urls.push(data.publicUrl)
        modelNames.push(MODELS[i].name)
        console.log(`[thumbnail] ${MODELS[i].name}: OK`)
      } catch (err: any) {
        console.error(`[thumbnail] ${MODELS[i].name} upload failed:`, err.message)
      }
    }

    // Save to DB
    if (urls.length > 0) {
      const { data: video } = await supabase.from('yt_videos')
        .select('producer_output')
        .eq('id', videoId)
        .single()

      const po = video?.producer_output
        ? { ...video.producer_output, thumbnail_urls: urls }
        : { thumbnail_urls: urls }

      await supabase.from('yt_videos').update({
        thumbnail_url: urls[0],
        producer_output: po,
        updated_at: new Date().toISOString(),
      }).eq('id', videoId)
    }

    return NextResponse.json({
      success: true,
      urls,
      models: modelNames,
      prompt: prompt.slice(0, 200) + '...',
    })
  } catch (err: any) {
    console.error('[thumbnail-gen]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
