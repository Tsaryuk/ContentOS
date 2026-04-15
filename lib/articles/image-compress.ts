// Compress images to target size for blog articles.
// Goal: <500KB, width 1280, JPEG progressive.
// Also auto-trims white/uniform borders that image models add as "book cover" frames.

import sharp from 'sharp'

const TARGET_SIZE = 500 * 1024 // 500 KB
const MAX_WIDTH = 1280
const TRIM_THRESHOLD = 25 // 0-255; higher = more aggressive trimming
const FORCED_CROP_PCT = 0.05 // Always crop 5% off each edge — kills AI model frame artifacts

// Trim surrounding uniform borders (white frames, paper texture, signatures)
async function trimBorders(buffer: Buffer): Promise<Buffer> {
  try {
    const trimmed = await sharp(buffer)
      .trim({ threshold: TRIM_THRESHOLD })
      .toBuffer()
    return trimmed
  } catch {
    return buffer
  }
}

// Force-crop fixed percentage off each edge (after trim) — guarantees no AI frame artifacts
async function forceCropEdges(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  if (!w || !h) return buffer

  const cropX = Math.round(w * FORCED_CROP_PCT)
  const cropY = Math.round(h * FORCED_CROP_PCT)
  const newW = w - cropX * 2
  const newH = h - cropY * 2

  if (newW < 100 || newH < 100) return buffer // safety

  return sharp(buffer)
    .extract({ left: cropX, top: cropY, width: newW, height: newH })
    .toBuffer()
}

// After trim we may have non-16:9 aspect — pad or crop to 1280x720
async function normalizeAspect(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).metadata()
  const w = meta.width ?? 0
  const h = meta.height ?? 0
  if (!w || !h) return buffer

  const targetRatio = 16 / 9
  const currentRatio = w / h

  // If already close to 16:9, just return
  if (Math.abs(currentRatio - targetRatio) < 0.02) return buffer

  // Crop center to 16:9 — better than padding with white bars
  let cropW = w
  let cropH = Math.round(w / targetRatio)
  if (cropH > h) {
    cropH = h
    cropW = Math.round(h * targetRatio)
  }
  const left = Math.round((w - cropW) / 2)
  const top = Math.round((h - cropH) / 2)

  return sharp(buffer).extract({ left, top, width: cropW, height: cropH }).toBuffer()
}

export async function compressArticleImage(rawBuffer: Buffer): Promise<Buffer> {
  // 1. Trim any uniform border edges (white frames, paper texture)
  const trimmed = await trimBorders(rawBuffer)

  // 2. Force-crop 5% off each edge to kill AI model frame artifacts
  // (subtle grey/tan borders, torn-paper effects, signatures that trim missed)
  const cropped = await forceCropEdges(trimmed)

  // 3. Normalize to 16:9 center crop (avoids weird aspect after trim/crop)
  const normalized = await normalizeAspect(cropped)

  // 3. Resize to max width
  let pipeline = sharp(normalized).resize({ width: MAX_WIDTH, withoutEnlargement: true })

  // 4. Adaptive quality until under target size
  let quality = 82
  let result = await pipeline.jpeg({ quality, progressive: true, mozjpeg: true }).toBuffer()

  while (result.length > TARGET_SIZE && quality >= 50) {
    quality -= 8
    result = await sharp(normalized)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality, progressive: true, mozjpeg: true })
      .toBuffer()
  }

  if (result.length > TARGET_SIZE) {
    for (const w of [1024, 960, 800]) {
      result = await sharp(normalized)
        .resize({ width: w, withoutEnlargement: true })
        .jpeg({ quality: 70, progressive: true, mozjpeg: true })
        .toBuffer()
      if (result.length <= TARGET_SIZE) break
    }
  }

  return result
}
