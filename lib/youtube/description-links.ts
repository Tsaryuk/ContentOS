// Pure helpers for managing the link section of a YouTube description.
//
// A ContentOS-managed "link block" lives at the bottom of the description,
// delimited by a marker line. Everything from the marker to the end is the
// managed block (rebuilt by bulk ops); text above it is the human-written body.
//
// Caveat: block detection keys on the marker line. If a hand-written body
// contains a line exactly equal to the marker, the boundary is mis-detected —
// the marker is chosen to be unlikely in normal prose.

export const LINK_BLOCK_MARKER = '— — —'

interface LinkRules {
  required_links?: string[]
  channel_links?: string
}

/**
 * Build the managed link-block text from channel rules. Prefers the freeform
 * `channel_links` block if set; otherwise joins `required_links`.
 */
export function buildChannelLinkBlock(rules: LinkRules | null | undefined): string {
  if (!rules) return ''
  const freeform = (rules.channel_links ?? '').trim()
  if (freeform) return freeform
  const links = (rules.required_links ?? []).map((l) => l.trim()).filter(Boolean)
  return links.join('\n')
}

/** Return the description with any existing managed block stripped off. */
export function stripLinkBlock(description: string): string {
  const idx = description.indexOf(`\n${LINK_BLOCK_MARKER}`)
  if (idx === -1) return description
  return description.slice(0, idx)
}

/**
 * Replace (or append) the managed link block at the bottom of a description.
 * Idempotent: re-applying with the same block yields the same text.
 */
export function applyLinkBlock(description: string, linkBlock: string): string {
  const body = stripLinkBlock(description).trimEnd()
  const block = linkBlock.trim()
  if (!block) return body
  return `${body}\n\n${LINK_BLOCK_MARKER}\n${block}`
}

/** Replace every occurrence of one URL (or string) with another. */
export function replaceUrl(description: string, fromUrl: string, toUrl: string): string {
  const from = fromUrl.trim()
  if (!from) return description
  return description.split(from).join(toUrl)
}
