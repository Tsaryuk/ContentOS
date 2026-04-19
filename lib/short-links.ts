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
  /Telegram/i,          // iOS adds "Telegram/X.Y" to UA; Android sends "Telegram-Android"
  /TelegramBot/i,       // Telegram link preview crawler — treat as in-app so we don't 302 crawler to YouTube
]

export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false
  return IN_APP_BROWSER_PATTERNS.some((re) => re.test(userAgent))
}

export type DevicePlatform = 'ios' | 'android' | 'other'

export function detectPlatform(userAgent: string | null | undefined): DevicePlatform {
  if (!userAgent) return 'other'
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  return 'other'
}

// iOS: vnd.youtube://<id> is claimed by the YouTube iOS app.
export function buildYouTubeAppUrl(ytVideoId: string): string {
  return `vnd.youtube://${ytVideoId}`
}

// Android: intent:// URL is the robust way to hand off to an app from a WebView.
// Browsers that don't understand `intent://` fall back to the `S.browser_fallback_url`.
export function buildYouTubeIntentUrl(ytVideoId: string, webFallbackUrl: string): string {
  const fallback = encodeURIComponent(webFallbackUrl)
  return `intent://www.youtube.com/watch?v=${ytVideoId}#Intent;package=com.google.android.youtube;scheme=https;S.browser_fallback_url=${fallback};end`
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
