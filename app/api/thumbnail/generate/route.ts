import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_KEY ?? '',
  )
}

export const maxDuration = 180

const MAX_SIZE_BYTES = 1.8 * 1024 * 1024 // 1.8 MB — safe margin under YouTube's 2 MB limit

type Template = 'solo' | 'duo' | 'custom'

// 4 emotion variants — applied to every template
const VARIANTS = [
  {
    name: 'Shock',
    emotion: 'shocked, eyes wide open, mouth slightly open, genuine surprise',
  },
  {
    name: 'Intense',
    emotion: 'intense focused stare, furrowed brows, determined expression',
  },
  {
    name: 'Confident',
    emotion: 'confident slight smirk, one eyebrow raised, self-assured look',
  },
  {
    name: 'Serious',
    emotion: 'serious contemplative expression, piercing direct eye contact',
  },
]

function templateLayout(template: Template, photoCount: number): string {
  if (template === 'duo') {
    return [
      'COMPOSITION: Two people side by side. EXTREME CLOSE-UP — heads and upper shoulders ONLY, filling the FULL frame height.',
      'The top of each head should be CROPPED by the frame edge (slightly cut off at top).',
      'Left person occupies the left third, right person occupies the right third.',
      'Text block in the center third between them.',
      'Faces VERY LARGE and dominant — each face takes up ~40% of frame height.',
      'BACKGROUND: Very dark near-black (#0f1a10). Soft, diffused deep green ambient light emanating from behind each person — subtle, atmospheric, NOT neon, NOT circular rings.',
      'Overall palette: near-black background, muted forest green soft glow, white and bright green (#4CAF50) text.',
    ].join(' ')
  }

  if (template === 'solo') {
    return [
      'COMPOSITION: One person on the RIGHT half of the frame. EXTREME CLOSE-UP — head and upper shoulders ONLY.',
      'The top of the head should be CROPPED by the frame edge (slightly cut off at top). Face VERY LARGE — takes up ~60% of frame height.',
      'Text block on the LEFT half.',
      'BACKGROUND: Very dark near-black (#0f1a10). Soft, diffused deep green ambient light from behind the person — subtle, atmospheric, NOT neon, NOT circular rings.',
      'Overall palette: near-black background, muted forest green soft glow, white and bright green (#4CAF50) text.',
    ].join(' ')
  }

  // custom
  if (photoCount <= 1) return 'One person from the reference photo, EXTREME CLOSE-UP, head and shoulders, positioned right side, face very large and dominant. Text on the left.'
  if (photoCount === 2) return 'Two people from reference photos, EXTREME CLOSE-UP, heads filling frame. Guest on left. Host on right. Both looking at camera.'
  return 'Multiple people from reference photos. EXTREME CLOSE-UP heads. Main guest prominent. All facing camera.'
}

function buildMasterPrompt(params: {
  textLine1: string
  textLine2: string
  guestName?: string
  emotion: string
  template: Template
  photoCount: number
  hasStyleRef: boolean
  refinement?: string
  channelStylePrompt?: string | null
}): string {
  const { textLine1, textLine2, guestName, emotion, template, photoCount, hasStyleRef, refinement, channelStylePrompt } = params

  return [
    'YouTube podcast thumbnail. 1280x720, 16:9 aspect ratio.',

    'Very dark near-black background with a deep green tint (#0f1a10). NO neon rings, NO circular halos.',
    'Soft diffused green ambient light gently wrapping around subjects from behind. Natural skin tones. High contrast editorial photography quality.',

    photoCount > 0
      ? `CRITICAL: The first ${photoCount} image(s) are FACE REFERENCES. Reproduce the exact face(s) with photorealistic accuracy — same person, same facial features, same bone structure. DO NOT invent new faces.`
      : '',

    hasStyleRef
      ? 'The LAST image is a STYLE REFERENCE ONLY — match its exact background color (very dark green-black), soft diffused atmospheric green glow behind subjects, and overall dark moody composition. DO NOT copy any faces or silhouettes from this style image. NO neon rings, NO bright circular halos — keep the glow soft and diffused like the reference.'
      : '',

    templateLayout(template, photoCount),
    `Facial expression: ${emotion}.`,
    'Eyes looking directly at camera. Face must be photorealistic.',

    `Large bold text, two lines:`,
    `Line 1 (white color, bold): "${textLine1}"`,
    `Line 2 (bright green #4CAF50, bold): "${textLine2}"`,
    'Text must be clearly readable at 160x90px preview size.',
    'Maximum 3 words total on the thumbnail.',
    'Font style: bold sans-serif, slightly condensed.',

    guestName ? `Small text at bottom: "${guestName}" in white, subtle.` : '',

    'No logos, no watermarks, no extra UI elements.',
    'No English text. All text must be in Russian Cyrillic.',
    'Dark background ensures text contrast.',
    'Professional YouTube podcast thumbnail quality.',

    channelStylePrompt ? `CHANNEL STYLE: ${channelStylePrompt}` : '',
    refinement ? `IMPORTANT MODIFICATION: ${refinement}` : '',
  ].filter(Boolean).join(' ')
}

function splitText(text: string): { line1: string; line2: string } {
  const dashSplit = text.split(/\s*[\/—–-]\s*/)
  if (dashSplit.length >= 2) {
    return { line1: dashSplit[0].trim(), line2: dashSplit.slice(1).join(' ').trim() }
  }
  const words = text.split(/\s+/)
  if (words.length >= 3) {
    const mid = Math.ceil(words.length / 2)
    return { line1: words.slice(0, mid).join(' '), line2: words.slice(mid).join(' ') }
  }
  if (words.length === 2) return { line1: words[0], line2: words[1] }
  return { line1: text, line2: '' }
}

async function compressToLimit(buffer: Buffer): Promise<Buffer> {
  if (buffer.length <= MAX_SIZE_BYTES) return buffer

  let quality = 85
  let result = buffer

  while (result.length > MAX_SIZE_BYTES && quality >= 40) {
    result = await sharp(buffer)
      .jpeg({ quality, progressive: true })
      .toBuffer()
    quality -= 10
  }

  // If still too big, resize down
  if (result.length > MAX_SIZE_BYTES) {
    result = await sharp(buffer)
      .resize({ width: 1280, height: 720, fit: 'cover' })
      .jpeg({ quality: 75, progressive: true })
      .toBuffer()
  }

  return result
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

    if (imageUrls.length > 0) input.image_urls = imageUrls

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
    const { videoId, channelId, photos, text, template = 'solo', referenceUrl, refinement, guestInfo } = body

    if (!videoId || !text) {
      return NextResponse.json({ error: 'videoId and text required' }, { status: 400 })
    }

    // Load per-channel thumbnail style prompt if channelId provided
    let channelStylePrompt: string | null = null
    if (channelId) {
      const { data: ch } = await supabase.from('yt_channels').select('rules').eq('id', channelId).single()
      channelStylePrompt = ch?.rules?.thumbnail_style_prompt ?? null
    }

    const { line1, line2 } = splitText(text)

    // Face photos first, then optional style reference (for any template type).
    const imageUrls: string[] = [...(photos ?? []), ...(referenceUrl ? [referenceUrl] : [])].filter(Boolean)
    const hasStyleRef = !!referenceUrl

    console.log(`[thumb] template=${template} "${line1} / ${line2}" | ${imageUrls.length} images | channelPrompt=${!!channelStylePrompt} | 4 variants...`)

    const settled = await Promise.allSettled(
      VARIANTS.map(v =>
        runNanoBanana(
          buildMasterPrompt({
            textLine1: line1,
            textLine2: line2,
            guestName: guestInfo,
            emotion: v.emotion,
            template: template as Template,
            photoCount: photos?.length ?? 0,
            hasStyleRef,
            refinement,
            channelStylePrompt,
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
        const rawBuf = Buffer.from(await imgRes.arrayBuffer())

        // Compress to stay under YouTube's 2 MB limit
        const compressed = await compressToLimit(rawBuf)
        console.log(`[thumb] ${r.value.name}: ${(rawBuf.length / 1024 / 1024).toFixed(2)}MB → ${(compressed.length / 1024 / 1024).toFixed(2)}MB`)

        const slug = r.value.name.toLowerCase().replace(/\s+/g, '_')
        const fileName = `${videoId}/gen_${slug}_${Date.now()}.jpg`

        await supabase.storage.from('thumbnails').upload(fileName, compressed, {
          contentType: 'image/jpeg', upsert: true,
        })
        const { data } = supabase.storage.from('thumbnails').getPublicUrl(fileName)
        urls.push(data.publicUrl)
        modelNames.push(r.value.name)
      } catch (err: any) {
        console.error(`[thumb] ${r.value.name} upload:`, err.message)
      }
    }

    if (urls.length > 0) {
      const { data: video } = await supabase.from('yt_videos')
        .select('producer_output').eq('id', videoId).single()

      const prevPo = video?.producer_output ?? {}
      const byTemplate = { ...(prevPo.thumbnail_urls_by_template ?? {}) }
      byTemplate[template] = urls

      // thumbnail_url = first url from any template (prefer just-generated)
      const po = { ...prevPo, thumbnail_urls_by_template: byTemplate }

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
