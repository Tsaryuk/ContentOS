// Video (YouTube) thumbnail generation engine.
//
// Ported verbatim-in-spirit from the old /api/thumbnail/generate route so the
// proven prompt-building, face compositing (nano-banana image edit), 4-emotion
// fan-out, channel style presets, and 2-line text overlay are preserved. This
// is the "video arm" of the covers system — much richer than the simple
// text-to-image cover engine in lib/covers/generate.ts because YouTube
// thumbnails need real faces + on-image text.
//
// Source of truth stays producer_output (thumbnail_urls_by_template_by_style /
// thumbnail_url / thumbnail_generating / saved_photos / saved_reference) — this
// keeps every already-generated thumbnail intact and the publish + polling
// flow untouched. We ALSO write a cover_generations row per run so the unified
// history + weekly cleanup see video generations too.

import { fal } from '@fal-ai/client'
import sharp from 'sharp'
import { supabaseAdmin } from '@/lib/supabase'
import { filterAllowedUrls, isAllowedUrl } from '@/lib/url-whitelist'
import { trackUsage } from '@/lib/cost'
import { resolveStylePreset } from '@/lib/thumbnail/style-presets'

const MAX_SIZE_BYTES = 1.8 * 1024 * 1024 // 1.8 MB — safe margin under YouTube's 2 MB cap

export type VideoTemplate = 'solo' | 'duo' | 'custom'

// 4 emotion variants — applied to every template.
const VARIANTS = [
  { name: 'Shock', emotion: 'shocked, eyes wide open, mouth slightly open, genuine surprise' },
  { name: 'Intense', emotion: 'intense focused stare, furrowed brows, determined expression' },
  { name: 'Confident', emotion: 'confident slight smirk, one eyebrow raised, self-assured look' },
  { name: 'Serious', emotion: 'serious contemplative expression, piercing direct eye contact' },
]

function templateLayout(template: VideoTemplate, photoCount: number): string {
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
  template: VideoTemplate
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
    result = await sharp(buffer).jpeg({ quality, progressive: true }).toBuffer()
    quality -= 10
  }
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
    console.log(`[covers-video] ${name}: starting with ${imageUrls.length} ref images...`)
    const input: Record<string, unknown> = {
      prompt,
      aspect_ratio: '16:9',
      resolution: '2K',
      num_images: 1,
      safety_tolerance: 5,
    }
    if (imageUrls.length > 0) input.image_urls = imageUrls

    const result = (await fal.subscribe('fal-ai/nano-banana-2/edit', { input: input as any })) as any
    const url = result?.data?.images?.[0]?.url ?? result?.images?.[0]?.url ?? null

    if (url) {
      trackUsage({
        provider: 'fal',
        model: 'fal-ai/nano-banana-2/edit',
        task: 'thumbnail',
        units: 1,
        videoId: videoId ?? null,
        metadata: { variant: name, styleId: styleId ?? null },
      })
    }
    console.log(`[covers-video] ${name}: ${url ? 'OK' : 'no image'}`)
    return { url, name }
  } catch (err) {
    console.error(`[covers-video] ${name} failed:`, err instanceof Error ? err.message?.slice(0, 300) : err)
    return { url: null, name }
  }
}

async function markGenerating(videoId: string, key: string | null): Promise<void> {
  const { data: video } = await supabaseAdmin.from('yt_videos').select('producer_output').eq('id', videoId).single()
  const po = { ...((video?.producer_output as Record<string, unknown>) ?? {}), thumbnail_generating: key }
  await supabaseAdmin.from('yt_videos').update({ producer_output: po, updated_at: new Date().toISOString() }).eq('id', videoId)
}

// Channel style prompt for a content_type. Channels store either a string
// (legacy — used for all types) or an object keyed by content_type.
function pickStylePrompt(rules: Record<string, unknown> | null | undefined, contentType: string): string | null {
  if (!rules) return null
  const raw = (rules as { thumbnail_style_prompt?: unknown }).thumbnail_style_prompt
  if (typeof raw === 'string') return raw || null
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, string | undefined>
    return obj[contentType] || obj.podcast || null
  }
  return null
}

export interface VideoThumbnailInput {
  videoId: string
  channelId?: string
  photos?: unknown
  text: string
  template?: VideoTemplate
  referenceUrl?: string
  refinement?: string
  guestInfo?: string
  contentType?: string
  styleId?: string
}

export interface VideoThumbnailPreview {
  dryRun: true
  contentType: string
  template: string
  textLine1: string
  textLine2: string
  facePhotos: number
  styleReference: boolean
  channelStylePrompt: string | null
  styleId: string
  styleName: string
  stylePresetPrompt: string | null
  refinement: string | null
  sampleEmotion: string
  sampleFullPrompt: string
  imageUrls: string[]
  variants: string[]
}

interface ResolvedContext {
  contentType: string
  channelStylePrompt: string | null
  channelRules: Record<string, unknown> | null
  stylePresetId: string
  stylePresetName: string
  stylePresetPrompt: string | null
  line1: string
  line2: string
  imageUrls: string[]
  hasStyleRef: boolean
  safePhotos: string[]
}

// Shared resolution used by both preview and real generation. Throws on
// disallowed URLs so the route can map to a 400.
async function resolveContext(input: VideoThumbnailInput): Promise<ResolvedContext> {
  const safePhotos = filterAllowedUrls(input.photos)
  const safeReference = isAllowedUrl(input.referenceUrl) ? input.referenceUrl : null
  if (Array.isArray(input.photos) && safePhotos.length !== input.photos.length) {
    throw new Error('photos contain disallowed URLs')
  }
  if (input.referenceUrl && !safeReference) {
    throw new Error('referenceUrl not in allow-list')
  }

  const { data: videoRow } = await supabaseAdmin
    .from('yt_videos')
    .select('content_type')
    .eq('id', input.videoId)
    .single()
  const contentType: string =
    (typeof input.contentType === 'string' && input.contentType) || videoRow?.content_type || 'podcast'

  let channelStylePrompt: string | null = null
  let channelRules: Record<string, unknown> | null = null
  if (input.channelId) {
    const { data: ch } = await supabaseAdmin.from('yt_channels').select('rules').eq('id', input.channelId).single()
    channelRules = (ch?.rules as Record<string, unknown> | null) ?? null
    channelStylePrompt = pickStylePrompt(channelRules, contentType)
  }
  const stylePreset = resolveStylePreset(channelRules, typeof input.styleId === 'string' ? input.styleId : null)

  const { line1, line2 } = splitText(input.text)
  const imageUrls = [...safePhotos, ...(safeReference ? [safeReference] : [])].filter(Boolean)

  return {
    contentType,
    channelStylePrompt,
    channelRules,
    stylePresetId: stylePreset.id,
    stylePresetName: stylePreset.name,
    stylePresetPrompt: stylePreset.prompt || null,
    line1,
    line2,
    imageUrls,
    hasStyleRef: !!safeReference,
    safePhotos,
  }
}

export async function buildVideoThumbnailPreview(input: VideoThumbnailInput): Promise<VideoThumbnailPreview> {
  const ctx = await resolveContext(input)
  const template = (input.template ?? 'solo') as VideoTemplate
  const sampleFullPrompt = buildMasterPrompt({
    textLine1: ctx.line1,
    textLine2: ctx.line2,
    guestName: input.guestInfo,
    emotion: VARIANTS[0].emotion,
    template,
    photoCount: ctx.safePhotos.length,
    hasStyleRef: ctx.hasStyleRef,
    refinement: input.refinement,
    channelStylePrompt: ctx.channelStylePrompt,
    stylePresetPrompt: ctx.stylePresetPrompt,
  })
  return {
    dryRun: true,
    contentType: ctx.contentType,
    template,
    textLine1: ctx.line1,
    textLine2: ctx.line2,
    facePhotos: ctx.safePhotos.length,
    styleReference: ctx.hasStyleRef,
    channelStylePrompt: ctx.channelStylePrompt,
    styleId: ctx.stylePresetId,
    styleName: ctx.stylePresetName,
    stylePresetPrompt: ctx.stylePresetPrompt,
    refinement: input.refinement ?? null,
    sampleEmotion: VARIANTS[0].name,
    sampleFullPrompt,
    imageUrls: ctx.imageUrls,
    variants: VARIANTS.map((v) => v.name),
  }
}

export interface VideoThumbnailResult {
  urls: string[]
  models: string[]
  styleId: string
}

export async function generateVideoThumbnails(
  input: VideoThumbnailInput,
  projectId?: string | null,
  createdBy?: string | null,
): Promise<VideoThumbnailResult> {
  fal.config({ credentials: process.env.FAL_KEY ?? '' })
  const ctx = await resolveContext(input)
  const template = (input.template ?? 'solo') as VideoTemplate

  // Persist content_type override so it sticks across reloads.
  if (typeof input.contentType === 'string') {
    await supabaseAdmin
      .from('yt_videos')
      .update({ content_type: input.contentType, updated_at: new Date().toISOString() })
      .eq('id', input.videoId)
  }

  // Mark generation in progress — survives page navigation. Format: `${template}__${styleId}`.
  const generatingKey = `${template}__${ctx.stylePresetId}`
  await markGenerating(input.videoId, generatingKey)

  console.log(
    `[covers-video] template=${template} type=${ctx.contentType} style=${ctx.stylePresetId} "${ctx.line1} / ${ctx.line2}" | ${ctx.imageUrls.length} images | 4 variants...`,
  )

  try {
    const settled = await Promise.allSettled(
      VARIANTS.map((v) =>
        runImageModel(
          buildMasterPrompt({
            textLine1: ctx.line1,
            textLine2: ctx.line2,
            guestName: input.guestInfo,
            emotion: v.emotion,
            template,
            photoCount: ctx.safePhotos.length,
            hasStyleRef: ctx.hasStyleRef,
            refinement: input.refinement,
            channelStylePrompt: ctx.channelStylePrompt,
            stylePresetPrompt: ctx.stylePresetPrompt,
          }),
          ctx.imageUrls,
          v.name,
          input.videoId,
          ctx.stylePresetId,
        ),
      ),
    )

    const urls: string[] = []
    const modelNames: string[] = []
    for (const r of settled) {
      if (r.status !== 'fulfilled' || !r.value.url) continue
      try {
        if (!isAllowedUrl(r.value.url)) {
          console.error(`[covers-video] ${r.value.name}: fal URL not in allow-list, skipping`)
          continue
        }
        const imgRes = await fetch(r.value.url)
        const rawBuf = Buffer.from(await imgRes.arrayBuffer())
        const compressed = await compressToLimit(rawBuf)
        const slug = r.value.name.toLowerCase().replace(/\s+/g, '_')
        const fileName = `${input.videoId}/gen_${slug}_${Date.now()}.jpg`
        await supabaseAdmin.storage.from('thumbnails').upload(fileName, compressed, {
          contentType: 'image/jpeg',
          upsert: true,
        })
        const { data } = supabaseAdmin.storage.from('thumbnails').getPublicUrl(fileName)
        urls.push(data.publicUrl)
        modelNames.push(r.value.name)
      } catch (err) {
        console.error(`[covers-video] ${r.value.name} upload:`, err instanceof Error ? err.message : err)
      }
    }

    // Save results into producer_output (source of truth — preserves existing
    // covers & keeps publish/polling intact) + clear generating flag.
    const { data: video } = await supabaseAdmin.from('yt_videos').select('producer_output').eq('id', input.videoId).single()
    const prevPo = (video?.producer_output as Record<string, any>) ?? {}
    const byTemplate = { ...(prevPo.thumbnail_urls_by_template ?? {}) }
    if (urls.length > 0) byTemplate[template] = urls
    const byTemplateByStyle = { ...(prevPo.thumbnail_urls_by_template_by_style ?? {}) }
    if (urls.length > 0) {
      byTemplateByStyle[template] = { ...(byTemplateByStyle[template] ?? {}), [ctx.stylePresetId]: urls }
    }
    const po = {
      ...prevPo,
      thumbnail_urls_by_template: byTemplate,
      thumbnail_urls_by_template_by_style: byTemplateByStyle,
      thumbnail_generating: null,
    }
    await supabaseAdmin
      .from('yt_videos')
      .update({
        ...(urls.length > 0 ? { thumbnail_url: urls[0] } : {}),
        producer_output: po,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.videoId)

    // Unified history: one cover_generations row so /covers cleanup + audit see
    // video runs. Picked URL stays driven by producer_output / yt_videos; this
    // row is informational. Best-effort — never fail the generation on it.
    if (urls.length > 0) {
      await supabaseAdmin
        .from('cover_generations')
        .insert({
          project_id: projectId ?? null,
          style_id: null,
          target_kind: 'video',
          target_id: input.videoId,
          title: input.text,
          description: input.guestInfo ?? null,
          scene: `${template}/${ctx.stylePresetId}`,
          aspect: '16:9',
          variants: urls.map((url, i) => ({ kind: modelNames[i] ?? `v${i}`, label: modelNames[i] ?? `Вариант ${i + 1}`, url })),
          picked_url: urls[0],
          picked_kind: modelNames[0] ?? null,
          picked_at: new Date().toISOString(),
          status: 'picked',
          created_by: createdBy ?? null,
        })
        .then(({ error }) => {
          if (error) console.warn('[covers-video] cover_generations insert failed:', error.message)
        })
    }

    console.log(`[covers-video] Done: ${urls.length}/4 variants saved (style=${ctx.stylePresetId})`)
    return { urls, models: modelNames, styleId: ctx.stylePresetId }
  } catch (err) {
    await markGenerating(input.videoId, null).catch(() => {})
    throw err
  }
}
