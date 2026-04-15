// Compress images to target size for blog articles.
// Goal: <500KB, width 1280, JPEG progressive.
// Heavy pages load fast; mobile users save data.

import sharp from 'sharp'

const TARGET_SIZE = 500 * 1024 // 500 KB
const MAX_WIDTH = 1280

export async function compressArticleImage(buffer: Buffer): Promise<Buffer> {
  // Resize to max width first (keeps aspect ratio)
  const base = sharp(buffer)
  const meta = await base.metadata()
  const needsResize = (meta.width ?? 0) > MAX_WIDTH

  let pipeline = sharp(buffer)
  if (needsResize) {
    pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true })
  }

  // Try decreasing quality until under target
  let quality = 82
  let result = await pipeline.jpeg({ quality, progressive: true, mozjpeg: true }).toBuffer()

  while (result.length > TARGET_SIZE && quality >= 50) {
    quality -= 8
    result = await sharp(buffer)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality, progressive: true, mozjpeg: true })
      .toBuffer()
  }

  // If still too big, downsize width progressively
  if (result.length > TARGET_SIZE) {
    for (const w of [1024, 960, 800]) {
      result = await sharp(buffer)
        .resize({ width: w, withoutEnlargement: true })
        .jpeg({ quality: 70, progressive: true, mozjpeg: true })
        .toBuffer()
      if (result.length <= TARGET_SIZE) break
    }
  }

  return result
}
