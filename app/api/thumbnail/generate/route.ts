import { NextRequest, NextResponse } from 'next/server'
import { fal } from '@fal-ai/client'
import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { filterAllowedUrls, isAllowedUrl } from '@/lib/url-whitelist'
import { trackUsage } from '@/lib/cost'
import { resolveStylePreset } from '@/lib/thumbnail/style-presets'

function getSupabase() {
  return supabaseAdmin
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
  stylePresetPrompt?: string | null
}): string {
  const { textLine1, textLine2, guestName, emotion, template, photoCount, hasStyleRef, refinement, channelStylePrompt, stylePresetPrompt } = params

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
    stylePresetPrompt ? stylePresetPrompt : '',
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

async function runImageModel(
  prompt: string,
  imageUrls: string[],
  name: string,
  videoId?: string,
  styleId?: string,
): Promise<{ url: string | null; name: string }> {
  try {
    console.log(`[thumb] ${name}: starting with ${imageUrls.length} ref images...`)

    // GPT Image 2 (edit) — uses image_size + quality + output_format.
    // No aspect_ratio/resolution/safety_tolerance like nano-banana had.
    const input: Record<string, unknown> = {
      prompt,
      image_size: 'landscape_16_9',
      quality: 'high',
      num_images: 1,
      output_format: 'jpeg',
    }

    if (imageUrls.length > 0) input.image_urls = imageUrls

    const result = await fal.subscribe('openai/gpt-image-2/edit', { input: input as any }) as any

    const url =
      result?.data?.images?.[0]?.url ??
      result?.images?.[0]?.url ??
      null

    if (url) {
      trackUsage({
        provider: 'fal',
        model: 'openai/gpt-image-2/edit',
        task: 'thumbnail',
        units: 1,
        videoId: videoId ?? null,
        metadata: { variant: name, styleId: styleId ?? null },
      })
    }

    console.log(`[thumb] ${name}: ${url ? 'OK' : 'no image'}`)
    return { url, name }
  } catch (err: any) {
    console.error(`[thumb] ${name} failed:`, err.message?.slice(0, 300))
    return { url: null, name }
  }
}

async function markGenerating(supabase: ReturnType<typeof getSupabase>, videoId: string, template: string | null) {
  const { data: video } = await supabase.from('yt_videos')
    .select('producer_output').eq('id', videoId).single()
  const po = { ...(video?.producer_output ?? {}), thumbnail_generating: template }
  await supabase.from('yt_videos').update({
    producer_output: po,
    updated_at: new Date().toISOString(),
  }).eq('id', videoId)
}

// Pick channel style prompt for a specific content_type. Channels may store
// either a single string (legacy — used for all types) or an object keyed by
// content_type. We fall back to the legacy string if the type-specific entry
// is empty, so old configs keep working.
function pickStylePrompt(
  rules: Record<string, unknown> | null | undefined,
  contentType: string,
): string | null {
  if (!rules) return null
  const raw = (rules as { thumbnail_style_prompt?: unknown }).thumbnail_style_prompt
  if (typeof raw === 'string') return raw || null
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, string | undefined>
    return obj[contentType] || obj.podcast || null
  }
  return null
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const supabase = getSupabase()
  let videoId = ''
  let template = 'solo'

  try {
    fal.config({ credentials: process.env.FAL_KEY ?? '' })
    const body = await req.json()
    videoId = body.videoId
    const { channelId, photos, text, referenceUrl, refinement, guestInfo, contentType: contentTypeOverride, styleId: styleIdInput } = body
    const dryRun: boolean = body.dryRun === true
    template = body.template ?? 'solo'

    if (!videoId || !text) {
      return NextResponse.json({ error: 'videoId and text required' }, { status: 400 })
    }

    // SSRF guard: only allow URLs from our trusted hosts
    const safePhotos = filterAllowedUrls(photos)
    const safeReference = isAllowedUrl(referenceUrl) ? referenceUrl : null
    if (Array.isArray(photos) && safePhotos.length !== photos.length) {
      return NextResponse.json({ error: 'photos contain disallowed URLs' }, { status: 400 })
    }
    if (referenceUrl && !safeReference) {
      return NextResponse.json({ error: 'referenceUrl not in allow-list' }, { status: 400 })
    }

    // Resolve content_type: explicit override > DB value > 'podcast'
    const { data: videoRow } = await supabase
      .from('yt_videos')
      .select('content_type')
      .eq('id', videoId)
      .single()
    const contentType: string =
      (typeof contentTypeOverride === 'string' && contentTypeOverride) ||
      videoRow?.content_type ||
      'podcast'

    // Load per-channel thumbnail style prompt (may be per-content-type)
    // and resolve the requested style preset against channel rules.
    let channelStylePrompt: string | null = null
    let channelRules: Record<string, unknown> | null = null
    if (channelId) {
      const { data: ch } = await supabase.from('yt_channels').select('rules').eq('id', channelId).single()
      channelRules = (ch?.rules as Record<string, unknown> | null) ?? null
      channelStylePrompt = pickStylePrompt(channelRules, contentType)
    }
    const stylePreset = resolveStylePreset(channelRules, typeof styleIdInput === 'string' ? styleIdInput : null)
    const stylePresetPrompt = stylePreset.prompt || null

    const { line1, line2 } = splitText(text)

    // Face photos first, then optional style reference (for any template type).
    const imageUrls: string[] = [...safePhotos, ...(safeReference ? [safeReference] : [])].filter(Boolean)
    const hasStyleRef = !!safeReference

    // B-03: dryRun mode — return the final prompt and image URLs without calling fal.
    // Used by UI to preview what will actually be sent to the model.
    if (dryRun) {
      const previewPrompt = buildMasterPrompt({
        textLine1: line1,
        textLine2: line2,
        guestName: guestInfo,
        emotion: VARIANTS[0].emotion,       // show the Shock variant as the representative sample
        template: template as Template,
        photoCount: safePhotos.length,
        hasStyleRef,
        refinement,
        channelStylePrompt,
        stylePresetPrompt,
      })
      return NextResponse.json({
        dryRun: true,
        contentType,
        template,
        textLine1: line1,
        textLine2: line2,
        facePhotos: safePhotos.length,
        styleReference: hasStyleRef,
        channelStylePrompt,
        styleId: stylePreset.id,
        styleName: stylePreset.name,
        stylePresetPrompt,
        refinement: refinement ?? null,
        sampleEmotion: VARIANTS[0].name,
        sampleFullPrompt: previewPrompt,
        imageUrls,
        variants: VARIANTS.map(v => v.name),
      })
    }

    // Persist user-selected content_type override so it sticks across reloads.
    if (typeof contentTypeOverride === 'string' && contentTypeOverride !== videoRow?.content_type) {
      await supabase
        .from('yt_videos')
        .update({ content_type: contentTypeOverride, updated_at: new Date().toISOString() })
        .eq('id', videoId)
    }

    // Mark generation in progress — survives page navigation.
    // Format: `${template}__${styleId}` so UI can match the active combo.
    const generatingKey = `${template}__${stylePreset.id}`
    await markGenerating(supabase, videoId, generatingKey)

    // Respond immediately — client can navigate away
    // Generation continues server-side

    console.log(`[thumb] template=${template} type=${contentType} style=${stylePreset.id} "${line1} / ${line2}" | ${imageUrls.length} images | channelPrompt=${!!channelStylePrompt} | 4 variants...`)

    const settled = await Promise.allSettled(
      VARIANTS.map(v =>
        runImageModel(
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
            stylePresetPrompt,
          }),
          imageUrls,
          v.name,
          videoId,
          stylePreset.id,
        )
      )
    )

    const urls: string[] = []
    const modelNames: string[] = []

    for (const r of settled) {
      if (r.status !== 'fulfilled' || !r.value.url) continue

      try {
        if (!isAllowedUrl(r.value.url)) {
          console.error(`[thumb] ${r.value.name}: fal response URL not in allow-list, skipping`)
          continue
        }
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

    // Save results + clear generating flag
    const { data: video } = await supabase.from('yt_videos')
      .select('producer_output').eq('id', videoId).single()

    const prevPo = video?.producer_output ?? {}
    const byTemplate = { ...(prevPo.thumbnail_urls_by_template ?? {}) }
    if (urls.length > 0) byTemplate[template] = urls

    // New: per-style nested structure — survives across styles without overwriting.
    const byTemplateByStyle = { ...(prevPo.thumbnail_urls_by_template_by_style ?? {}) }
    if (urls.length > 0) {
      byTemplateByStyle[template] = {
        ...(byTemplateByStyle[template] ?? {}),
        [stylePreset.id]: urls,
      }
    }

    const po = {
      ...prevPo,
      thumbnail_urls_by_template: byTemplate,
      thumbnail_urls_by_template_by_style: byTemplateByStyle,
      thumbnail_generating: null,
    }

    await supabase.from('yt_videos').update({
      ...(urls.length > 0 ? { thumbnail_url: urls[0] } : {}),
      producer_output: po,
      updated_at: new Date().toISOString(),
    }).eq('id', videoId)

    console.log(`[thumb] Done: ${urls.length}/4 variants saved (style=${stylePreset.id})`)
    return NextResponse.json({ success: true, urls, models: modelNames, styleId: stylePreset.id })
  } catch (err: any) {
    console.error('[thumb-gen]', err)
    // Clear generating flag on error
    if (videoId) {
      await markGenerating(supabase, videoId, null).catch(() => {})
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
