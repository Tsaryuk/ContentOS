/**
 * SSRF protection — whitelist of allowed outbound URL hosts.
 *
 * Any server-side fetch() with a caller-supplied URL must go through
 * isAllowedUrl() to reject javascript:/file:/data: schemes and block
 * hosts outside our trusted set (own Supabase Storage, fal.ai CDN).
 */

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

// Hosts we are allowed to fetch from server-side.
const ALLOWED_HOST_SUFFIXES = [
  // Our Supabase project storage (exact host from env).
  SUPABASE_URL ? new URL(SUPABASE_URL).host : null,
  // fal.ai inference result CDN.
  '.fal.media',
  '.fal.run',
  'fal.media',
  'fal.run',
  // YouTube thumbnails (used by yt_videos.current_thumbnail).
  '.ytimg.com',
  'i.ytimg.com',
  // Google user content (channel avatars).
  '.googleusercontent.com',
  'googleusercontent.com',
].filter(Boolean) as string[]

function hostAllowed(host: string): boolean {
  return ALLOWED_HOST_SUFFIXES.some(suffix =>
    suffix.startsWith('.') ? host.endsWith(suffix) : host === suffix,
  )
}

export function isAllowedUrl(raw: unknown): raw is string {
  if (typeof raw !== 'string' || !raw) return false
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
  return hostAllowed(parsed.host)
}

export function filterAllowedUrls(list: unknown): string[] {
  if (!Array.isArray(list)) return []
  return list.filter(isAllowedUrl)
}

export function assertAllowedUrl(raw: unknown, label = 'url'): string {
  if (!isAllowedUrl(raw)) {
    throw new Error(`${label} not in allow-list`)
  }
  return raw
}
