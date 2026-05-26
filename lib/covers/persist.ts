// Persist a chosen cover variant to our storage.
//
// fal.ai URLs expire ~24h after generation, so once the user picks one we
// download, compress, upload to the per-kind bucket, and write the public
// URL back into cover_generations + the target row.
//
// Each target_kind has a different storage bucket / row column it writes
// into. Encapsulated here so route handlers stay tiny.

import { supabaseAdmin } from '@/lib/supabase'
import { compressArticleImage } from '@/lib/articles/image-compress'
import { isAllowedUrl } from '@/lib/url-whitelist'
import type { TargetKind } from '@/lib/covers/generate'

interface BucketSpec {
  bucket: string
  /** Returns the storage path for the uploaded file. */
  path: (targetId: string | null) => string
}

const BUCKETS: Record<TargetKind, BucketSpec> = {
  article: {
    bucket: 'articles',
    path: (id) => `articles/${id ?? 'unassigned'}/cover_${Date.now()}.jpg`,
  },
  video: {
    bucket: 'thumbnails',
    path: (id) => `videos/${id ?? 'unassigned'}/cover_${Date.now()}.jpg`,
  },
  newsletter: {
    bucket: 'articles',
    path: (id) => `newsletters/${id ?? 'unassigned'}/cover_${Date.now()}.jpg`,
  },
  telegram_post: {
    bucket: 'articles',
    path: (id) => `telegram/${id ?? 'unassigned'}/cover_${Date.now()}.jpg`,
  },
  carousel: {
    bucket: 'thumbnails',
    path: (id) => `carousels/${id ?? 'unassigned'}/cover_${Date.now()}.jpg`,
  },
  podcast: {
    bucket: 'thumbnails',
    path: (id) => `podcasts/${id ?? 'unassigned'}/cover_${Date.now()}.jpg`,
  },
}

export interface PickCoverResult {
  url: string
  pickedKind: string
}

interface CoverGenerationRow {
  id: string
  target_kind: TargetKind
  target_id: string | null
  variants: Array<{ kind: string; label: string; url: string }>
  status: string
}

/**
 * Persist one variant of a generation to storage and mark the generation
 * as picked. Returns the storage URL. Does NOT update the target row —
 * callers do that, since `cover_url` lives on different tables per kind.
 */
export async function pickCover(generationId: string, pickedKind: string): Promise<PickCoverResult> {
  const { data: gen, error: genErr } = await supabaseAdmin
    .from('cover_generations')
    .select('id, target_kind, target_id, variants, status')
    .eq('id', generationId)
    .maybeSingle<CoverGenerationRow>()

  if (genErr) throw new Error(`Generation lookup failed: ${genErr.message}`)
  if (!gen) throw new Error('Генерация не найдена')

  const variant = gen.variants?.find((v) => v.kind === pickedKind)
  if (!variant) throw new Error(`Вариант "${pickedKind}" не найден в генерации`)
  if (!isAllowedUrl(variant.url)) {
    throw new Error('URL варианта не входит в allow-list')
  }

  const spec = BUCKETS[gen.target_kind]
  if (!spec) throw new Error(`Неизвестный target_kind: ${gen.target_kind}`)

  const imgRes = await fetch(variant.url)
  if (!imgRes.ok) throw new Error(`Скачивание не удалось: HTTP ${imgRes.status}`)
  const rawBuffer = Buffer.from(await imgRes.arrayBuffer())
  const buffer = await compressArticleImage(rawBuffer)
  console.log(
    `[covers] pick ${pickedKind} ${(rawBuffer.length / 1024).toFixed(0)}KB → ${(buffer.length / 1024).toFixed(0)}KB`,
  )

  const fileName = spec.path(gen.target_id)
  const { error: uploadErr } = await supabaseAdmin.storage
    .from(spec.bucket)
    .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true })
  if (uploadErr) throw uploadErr

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from(spec.bucket).getPublicUrl(fileName)

  const { error: updateErr } = await supabaseAdmin
    .from('cover_generations')
    .update({
      picked_kind: pickedKind,
      picked_url: publicUrl,
      picked_at: new Date().toISOString(),
      status: 'picked',
    })
    .eq('id', generationId)

  if (updateErr) {
    console.error('[covers] pick: failed to mark generation picked:', updateErr.message)
  }

  return { url: publicUrl, pickedKind }
}
