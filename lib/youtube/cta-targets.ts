// CTA targeting for AI replies.
//
// A "CTA target" is a project the AI may offer in a reply. Each YouTube
// channel whitelists which projects are allowed (channel.rules.comments.
// cta_project_ids) so a channel about entrepreneurship doesn't end up
// promoting a podcast aimed at philosophy fans. The AI gets the
// description + audience keywords for each allowed project and decides
// 0/1 of them to drop into the reply, or none if nothing fits.
//
// Attribution after the fact is URL-based: match the URLs in the sent
// reply against the URLs of allowed projects. First hit wins. Logged in
// comment_reply_log.cta_project_id for downstream analytics.

import { supabaseAdmin } from '@/lib/supabase'

export interface CtaTarget {
  id: string
  name: string
  url: string
  description: string
  audience: string[]
  priority: number
}

interface ProjectRow {
  id: string
  name: string
  cta_url: string | null
  cta_description: string | null
  cta_audience_keywords: string[] | null
  cta_priority: number | null
  is_active: boolean | null
}

/**
 * Load the CTA targets a given channel is allowed to promote. Empty
 * `allowedIds` means "use no project-level CTAs" — the prompt falls back
 * to the legacy telegram_url / community_url in channel.rules.comments.
 * Active projects with non-empty cta_url are eligible; the rest are
 * filtered out (they aren't fully configured yet).
 */
export async function loadCtaTargets(allowedIds: string[]): Promise<CtaTarget[]> {
  if (!allowedIds.length) return []
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('id, name, cta_url, cta_description, cta_audience_keywords, cta_priority, is_active')
    .in('id', allowedIds)
  if (error || !data) return []
  return (data as ProjectRow[])
    .filter((p) => p.is_active !== false)
    .filter((p) => typeof p.cta_url === 'string' && p.cta_url.trim().length > 0)
    .map((p) => ({
      id: p.id,
      name: p.name,
      url: p.cta_url!.trim(),
      description: p.cta_description?.trim() ?? '',
      audience: p.cta_audience_keywords ?? [],
      priority: p.cta_priority ?? 0,
    }))
    .sort((a, b) => b.priority - a.priority)
}

/**
 * After the AI generates a reply, find which (if any) of the allowed CTA
 * targets it actually used. Match on substring of the URL — we don't
 * care about UTM params or query strings on top of the canonical URL.
 */
export function detectUsedTarget(replyText: string, targets: CtaTarget[]): CtaTarget | null {
  if (!replyText || !targets.length) return null
  for (const t of targets) {
    if (replyText.includes(t.url)) return t
  }
  // Fallback: hostname/path match (in case the model truncated query).
  for (const t of targets) {
    try {
      const u = new URL(t.url)
      const hostPath = `${u.hostname}${u.pathname}`.replace(/\/+$/, '')
      if (hostPath && replyText.includes(hostPath)) return t
    } catch {
      // Bad URL stored on the project — skip.
    }
  }
  return null
}
