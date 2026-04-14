import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { fal } from '@fal-ai/client'

export const maxDuration = 120

const STYLE_PREFIX = `Black and white ink illustration in the style of detailed woodcut engraving. High contrast, intricate crosshatching, fine line work. Dark atmospheric scene with deep shadows. Editorial illustration style reminiscent of classic book engravings. No text, no watermark, no letters.`

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    fal.config({ credentials: process.env.FAL_KEY ?? '' })

    const { subject, description } = await req.json()

    if (!subject?.trim()) {
      return NextResponse.json({ error: 'Укажите тему статьи' }, { status: 400 })
    }

    const prompt = `${STYLE_PREFIX} Scene: ${description || subject}. Mood: contemplative, philosophical, mysterious. Aspect ratio 16:9, wide cinematic composition.`

    const result = await fal.subscribe('fal-ai/flux/dev', {
      input: {
        prompt,
        image_size: { width: 1280, height: 720 },
        num_images: 2,
        num_inference_steps: 28,
        guidance_scale: 3.5,
      },
    }) as any

    const images = result?.data?.images ?? result?.images ?? []
    const urls = images.map((img: any) => img.url).filter(Boolean)

    return NextResponse.json({ urls })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка генерации обложки'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
