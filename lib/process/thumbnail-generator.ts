/**
 * Thumbnail Generator — composites podcast thumbnails from components:
 * 1. Colored background (solid or AI-generated)
 * 2. Guest photo (screenshot from video or uploaded)
 * 3. Text overlay (title, guest name, duration)
 *
 * Uses Sharp for image processing — no AI text generation (Russian text is bad in AI).
 */

import sharp from 'sharp'

const WIDTH = 1280
const HEIGHT = 720

interface ThumbnailOptions {
  title: string
  guestName?: string
  duration?: string
  bgColor: string        // hex color e.g. '#2d5a27'
  bgImageUrl?: string    // optional AI-generated background
  guestPhotoUrl?: string // guest photo URL
  accentColor?: string   // text highlight color
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    if ((current + ' ' + word).trim().length > maxCharsPerLine) {
      if (current) lines.push(current.trim())
      current = word
    } else {
      current = current ? current + ' ' + word : word
    }
  }
  if (current) lines.push(current.trim())
  return lines
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function buildTextSvg(options: ThumbnailOptions): string {
  const titleLines = wrapText(options.title, 20)
  const titleFontSize = titleLines.some(l => l.length > 15) ? 52 : 60
  const lineHeight = titleFontSize * 1.2

  const titleY = options.guestName ? 160 : 200
  const titleSvgLines = titleLines.map((line, i) =>
    `<text x="60" y="${titleY + i * lineHeight}" font-family="Arial, sans-serif" font-weight="900" font-size="${titleFontSize}" fill="white" style="text-shadow: 2px 2px 8px rgba(0,0,0,0.5)">${escapeXml(line)}</text>`
  ).join('\n')

  const guestSvg = options.guestName
    ? `<text x="60" y="${HEIGHT - 100}" font-family="Arial, sans-serif" font-weight="700" font-size="32" fill="${options.accentColor ?? '#FFD700'}">${escapeXml(options.guestName)}</text>`
    : ''

  const durationSvg = options.duration
    ? `<rect x="${WIDTH - 180}" y="${HEIGHT - 60}" width="160" height="40" rx="8" fill="rgba(0,0,0,0.7)"/>
       <text x="${WIDTH - 100}" y="${HEIGHT - 32}" font-family="Arial, sans-serif" font-weight="700" font-size="22" fill="white" text-anchor="middle">${escapeXml(options.duration)}</text>`
    : ''

  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    ${titleSvgLines}
    ${guestSvg}
    ${durationSvg}
  </svg>`
}

export async function generateThumbnail(options: ThumbnailOptions): Promise<Buffer> {
  // Step 1: Create base image
  let base: sharp.Sharp

  if (options.bgImageUrl) {
    try {
      const res = await fetch(options.bgImageUrl)
      const buf = Buffer.from(await res.arrayBuffer())
      base = sharp(buf).resize(WIDTH, HEIGHT, { fit: 'cover' })
      // Darken the background so text is readable
      base = base.modulate({ brightness: 0.5 })
    } catch {
      // Fallback to solid color
      base = sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: options.bgColor } })
    }
  } else {
    // Gradient-like effect with solid color
    base = sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: options.bgColor } })
  }

  // Step 2: Prepare composites
  const composites: sharp.OverlayOptions[] = []

  // Step 3: Guest photo (right side, 40% of width)
  if (options.guestPhotoUrl) {
    try {
      const photoRes = await fetch(options.guestPhotoUrl)
      const photoBuf = Buffer.from(await photoRes.arrayBuffer())
      const guestPhoto = await sharp(photoBuf)
        .resize(500, HEIGHT, { fit: 'cover', position: 'top' })
        .toBuffer()

      composites.push({
        input: guestPhoto,
        left: WIDTH - 500,
        top: 0,
      })

      // Gradient overlay on left edge of photo for text readability
      const gradientSvg = `<svg width="200" height="${HEIGHT}">
        <defs>
          <linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="${options.bgColor}" stop-opacity="1"/>
            <stop offset="100%" stop-color="${options.bgColor}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <rect width="200" height="${HEIGHT}" fill="url(#g)"/>
      </svg>`

      composites.push({
        input: Buffer.from(gradientSvg),
        left: WIDTH - 500,
        top: 0,
      })
    } catch (err) {
      console.error('[thumbnail] Failed to load guest photo:', err)
    }
  }

  // Step 4: Text overlay
  const textSvg = buildTextSvg(options)
  composites.push({
    input: Buffer.from(textSvg),
    left: 0,
    top: 0,
  })

  // Step 5: Composite all layers
  const result = await base
    .composite(composites)
    .jpeg({ quality: 95 })
    .toBuffer()

  return result
}

// Color palette for podcast thumbnails
export const THUMBNAIL_COLORS = [
  '#2d5a27', // dark green
  '#1a3a5c', // dark blue
  '#5c1a1a', // dark red
  '#3d2d5a', // dark purple
  '#5a4a1a', // dark gold
  '#1a4a4a', // dark teal
  '#4a2d1a', // dark brown
  '#2d2d5a', // navy
]

export function pickColor(index: number): string {
  return THUMBNAIL_COLORS[index % THUMBNAIL_COLORS.length]
}
