// Inline image upload — accepts a multipart file from the editor, resizes/
// compresses it for the web, stores it in Supabase Storage and returns the
// public URL. Separate from /api/articles/image (AI generation) because:
//   - it takes multipart/form-data, not JSON
//   - it does NOT crop to 16:9 (user-uploaded inline images keep their ratio;
//     only the cover endpoint normalizes to 16:9)

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import sharp from 'sharp'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const MAX_BYTES = 12 * 1024 * 1024 // 12 MB raw upload cap
const MAX_WIDTH = 1600
const TARGET_BYTES = 600 * 1024 // 600 KB after compression
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

async function compressInlineImage(
  rawBuffer: Buffer,
  mime: string,
): Promise<{ buffer: Buffer; ext: string; contentType: string }> {
  // Keep GIF as-is — animated frames can't be re-encoded with sharp here
  // without dropping animation, and inline GIFs are usually small enough.
  if (mime === 'image/gif') return { buffer: rawBuffer, ext: 'gif', contentType: 'image/gif' }

  let quality = 82
  let out = await sharp(rawBuffer)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality, progressive: true, mozjpeg: true })
    .toBuffer()

  while (out.length > TARGET_BYTES && quality >= 50) {
    quality -= 8
    out = await sharp(rawBuffer)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality, progressive: true, mozjpeg: true })
      .toBuffer()
  }

  return { buffer: out, ext: 'jpg', contentType: 'image/jpeg' }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const form = await req.formData()
    const file = form.get('file')
    const articleId = form.get('article_id')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 })
    }
    if (typeof articleId !== 'string' || !articleId) {
      return NextResponse.json({ error: 'article_id is required' }, { status: 400 })
    }
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: `Неподдерживаемый формат: ${file.type}` }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `Файл больше ${Math.round(MAX_BYTES / 1024 / 1024)} МБ` },
        { status: 400 },
      )
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer())
    const { buffer, ext, contentType } = await compressInlineImage(rawBuffer, file.type)

    const fileName = `articles/${articleId}/upload_${Date.now()}.${ext}`
    const { error: uploadError } = await supabaseAdmin.storage
      .from('articles')
      .upload(fileName, buffer, { contentType, upsert: true })
    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabaseAdmin.storage.from('articles').getPublicUrl(fileName)

    // Audit row in the same table the AI-gen endpoint writes to.
    // `prompt` is null for hand-uploaded images, which is how they're told apart.
    await supabaseAdmin
      .from('nl_article_images')
      .insert({ article_id: articleId, url: publicUrl, prompt: null })

    return NextResponse.json({ url: publicUrl })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки'
    console.error('[image-upload] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
