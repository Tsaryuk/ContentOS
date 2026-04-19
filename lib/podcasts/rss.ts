/**
 * Apple-compliant podcast RSS 2.0 generator. Mave.digital, Яндекс.Музыка,
 * Apple Podcasts, Spotify, Castbox, Zvuk all accept this format.
 *
 * Spec references:
 *   - Apple: https://podcasters.apple.com/support/823-podcast-requirements
 *   - Яндекс.Подкастер: https://yandex.ru/support/music-podcaster/
 *
 * Notes on the wire format:
 *   - <enclosure length="..."> is bytes, not seconds.
 *   - <itunes:duration> is seconds or HH:MM:SS — we emit seconds.
 *   - <pubDate> must be RFC-822 (the "Sun, 19 Apr 2026 10:00:00 +0000" style).
 *   - We escape user-supplied text into CDATA blocks to survive arbitrary
 *     characters in titles / descriptions without double-escaping XML entities.
 */

export interface PodcastShowForFeed {
  slug: string
  title: string
  description: string | null
  author: string | null
  owner_name: string | null
  owner_email: string | null
  language: string
  category: string | null
  subcategory: string | null
  cover_url: string | null
  explicit: boolean
}

export interface PodcastEpisodeForFeed {
  id: string
  title: string
  description: string | null
  cover_url: string | null
  audio_url: string
  audio_size: number | null
  audio_mime: string
  duration_sec: number | null
  episode_number: number | null
  season: number | null
  published_at: string        // ISO
  explicit: boolean
}

function cdata(text: string | null | undefined): string {
  if (!text) return ''
  // A literal ']]>' inside CDATA would close the block — split it defensively.
  return `<![CDATA[${String(text).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`
}

function rfc822(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toUTCString()
}

function escAttr(s: string | null | undefined): string {
  if (!s) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function renderPodcastRss(
  show: PodcastShowForFeed,
  episodes: PodcastEpisodeForFeed[],
  selfUrl: string,
  landingUrl: string,
): string {
  const itemsXml = episodes.map(ep => {
    const cover = ep.cover_url ?? show.cover_url
    return `    <item>
      <title>${cdata(ep.title)}</title>
      <description>${cdata(ep.description ?? '')}</description>
      <itunes:summary>${cdata(ep.description ?? '')}</itunes:summary>
      <content:encoded>${cdata(ep.description ?? '')}</content:encoded>
      <pubDate>${rfc822(ep.published_at)}</pubDate>
      <guid isPermaLink="false">${escAttr(ep.id)}</guid>
      <enclosure url="${escAttr(ep.audio_url)}" length="${ep.audio_size ?? 0}" type="${escAttr(ep.audio_mime)}" />
      ${ep.duration_sec != null ? `<itunes:duration>${ep.duration_sec}</itunes:duration>` : ''}
      ${ep.episode_number != null ? `<itunes:episode>${ep.episode_number}</itunes:episode>` : ''}
      ${ep.season != null ? `<itunes:season>${ep.season}</itunes:season>` : ''}
      <itunes:explicit>${ep.explicit ? 'true' : 'false'}</itunes:explicit>
      ${cover ? `<itunes:image href="${escAttr(cover)}" />` : ''}
    </item>`
  }).join('\n')

  const cat = show.category
  const subcat = show.subcategory

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <atom:link href="${escAttr(selfUrl)}" rel="self" type="application/rss+xml" />
    <title>${cdata(show.title)}</title>
    <link>${escAttr(landingUrl)}</link>
    <language>${escAttr(show.language)}</language>
    <description>${cdata(show.description ?? '')}</description>
    <itunes:summary>${cdata(show.description ?? '')}</itunes:summary>
    <itunes:author>${cdata(show.author ?? '')}</itunes:author>
    <itunes:owner>
      <itunes:name>${cdata(show.owner_name ?? show.author ?? '')}</itunes:name>
      <itunes:email>${cdata(show.owner_email ?? '')}</itunes:email>
    </itunes:owner>
    ${show.cover_url ? `<itunes:image href="${escAttr(show.cover_url)}" />` : ''}
    ${show.cover_url ? `<image><url>${escAttr(show.cover_url)}</url><title>${cdata(show.title)}</title><link>${escAttr(landingUrl)}</link></image>` : ''}
    <itunes:explicit>${show.explicit ? 'true' : 'false'}</itunes:explicit>
    <itunes:type>episodic</itunes:type>
    ${cat ? `<itunes:category text="${escAttr(cat)}">${subcat ? `<itunes:category text="${escAttr(subcat)}" />` : ''}</itunes:category>` : ''}
${itemsXml}
  </channel>
</rss>
`
}
