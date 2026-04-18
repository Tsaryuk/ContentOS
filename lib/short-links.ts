import { customAlphabet } from 'nanoid'

const ALPHABET = '123456789abcdefghjkmnpqrstuvwxyz'
const SLUG_LENGTH = 8

const generateSlug = customAlphabet(ALPHABET, SLUG_LENGTH)

export function generateShortSlug(): string {
  return generateSlug()
}

const IN_APP_BROWSER_PATTERNS: RegExp[] = [
  /Instagram/i,
  /FBAN|FBAV|FB_IAB/i,
  /Messenger/i,
  /Threads/i,
  /TikTok|musical_ly|ByteLocale|BytedanceWebview/i,
  /Line\//i,
  /Twitter|X\/(?:iOS|Android)/i,
  /LinkedInApp/i,
  /VKAndroidApp|VKLocale/i,
  /OKApp/i,
  /Snapchat/i,
  /Pinterest/i,
]

export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false
  return IN_APP_BROWSER_PATTERNS.some((re) => re.test(userAgent))
}

export function buildYouTubeAppUrl(ytVideoId: string): string {
  return `vnd.youtube://${ytVideoId}`
}

export function buildYouTubeWebUrl(ytVideoId: string): string {
  return `https://www.youtube.com/watch?v=${ytVideoId}`
}

export function shortLinkBase(): string {
  return (
    process.env.NEXT_PUBLIC_SHORT_LINK_BASE ||
    process.env.NEXT_PUBLIC_APP_URL ||
    ''
  ).replace(/\/+$/, '')
}

export function shortLinkUrl(slug: string): string {
  const base = shortLinkBase()
  return base ? `${base}/v/${slug}` : `/v/${slug}`
}
