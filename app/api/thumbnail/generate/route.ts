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

export async function POST(req: NextRequest) {
  try {
    initFal()
    const supabase = getSupabase()
    const body = await req.json()
    const { videoId, photos, text, referenceUrl, refinement } = body

    if (!videoId || !text) {
      return NextResponse.json({ error: 'videoId and text required' }, { status: 400 })
    }

    const photoDesc = photos?.length
      ? `The thumbnail should include the provided person photos prominently.`
      : ''

    const refDesc = referenceUrl
      ? `Use this reference image as a style guide for layout, colors, and composition.`
      : ''

    const refineDesc = refinement
      ? `Additional instruction: ${refinement}`
      : ''

    const basePrompt = [
      `Professional YouTube podcast thumbnail, 1280x720, high quality.`,
      `Large bold Russian text on the thumbnail: "${text}"`,
      `Dark cinematic background with accent lighting.`,
      `Professional podcast style, clean composition.`,
      photoDesc,
      refDesc,
      refineDesc,
    ].filter(Boolean).join(' ')

    const urls: string[] = []

    // Generate 3 variants with slight prompt variations
    const variations = [
      basePrompt,
      basePrompt + ' Green and dark tones, moody atmosphere.',
      basePrompt + ' Blue and dark tones, premium feel.',
    ]

    for (let i = 0; i < 3; i++) {
      try {
        const input: Record<string, unknown> = {
          prompt: variations[i],
          num_images: 1,
          image_size: { width: 1280, height: 720 },
          enable_safety_checker: false,
        }

        // If reference image provided, use image-to-image
        if (referenceUrl) {
          input.image_url = referenceUrl
          input.strength = 0.65 // keep reference style but generate new content
        }

        // If photos provided, include first photo as image input
        if (photos?.length && !referenceUrl) {
          input.image_url = photos[0]
          input.strength = 0.5
        }

        const result = await fal.subscribe('fal-ai/flux/dev/image-to-image', {
          input: input as any,
        }) as any

        const imageUrl = result?.data?.images?.[0]?.url ?? result?.images?.[0]?.url
        if (!imageUrl) {
          console.error(`[thumbnail-gen] No image URL in response ${i}`)
          continue
        }

        // Download and upload to Supabase
        const imgRes = await fetch(imageUrl)
        const imgBuf = Buffer.from(await imgRes.arrayBuffer())
        const fileName = `${videoId}/generated_${i}_${Date.now()}.jpg`

        await supabase.storage.from('thumbnails').upload(fileName, imgBuf, {
          contentType: 'image/jpeg',
          upsert: true,
        })

        const { data } = supabase.storage.from('thumbnails').getPublicUrl(fileName)
        urls.push(data.publicUrl)
      } catch (err: any) {
        console.error(`[thumbnail-gen] Variant ${i} failed:`, err.message)
      }
    }

    // Save URLs to video record
    if (urls.length > 0) {
      await supabase.from('yt_videos').update({
        thumbnail_url: urls[0],
        updated_at: new Date().toISOString(),
      }).eq('id', videoId)

      // Also update producer_output.thumbnail_urls
      const { data: video } = await supabase.from('yt_videos')
        .select('producer_output')
        .eq('id', videoId)
        .single()

      if (video?.producer_output) {
        const po = { ...video.producer_output, thumbnail_urls: urls }
        await supabase.from('yt_videos').update({
          producer_output: po,
        }).eq('id', videoId)
      }
    }

    return NextResponse.json({ success: true, urls })
  } catch (err: any) {
    console.error('[thumbnail-gen]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
