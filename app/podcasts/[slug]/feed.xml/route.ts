/**
 * GET /podcasts/[slug]/feed.xml — public, unauthenticated podcast RSS feed.
 *
 * Consumed by Mave.digital (and anyone else subscribing directly). Returns
 * 404 when the slug doesn't map to an active show so we don't leak shows
 * that were soft-disabled in /settings.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  renderPodcastRss,
  type PodcastShowForFeed,
  type PodcastEpisodeForFeed,
} from '@/lib/podcasts/rss'

const CACHE_SECONDS = 300

function absoluteUrl(req: NextRequest, path: string): string {
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  return `${proto}://${host}${path}`
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse | Response> {
  const { slug } = await params

  const { data: show, error: showErr } = await supabaseAdmin
    .from('podcast_shows')
    .select('id, slug, title, description, author, owner_name, owner_email, language, category, subcategory, cover_url, explicit, is_active')
    .eq('slug', slug)
    .maybeSingle<PodcastShowForFeed & { id: string; is_active: boolean }>()

  if (showErr) {
    return NextResponse.json({ error: showErr.message }, { status: 500 })
  }
  if (!show || !show.is_active) {
    return new NextResponse('Not found', { status: 404 })
  }

  const { data: eps } = await supabaseAdmin
    .from('podcast_episodes')
    .select('id, title, description, cover_url, audio_url, audio_size, audio_mime, duration_sec, episode_number, season, published_at, explicit')
    .eq('status', 'published')
    .eq('show_id', show.id)
    .order('published_at', { ascending: false })

  const selfUrl = absoluteUrl(req, `/podcasts/${slug}/feed.xml`)
  const landingUrl = absoluteUrl(req, `/podcasts/${slug}`)
  const xml = renderPodcastRss(show, (eps ?? []) as PodcastEpisodeForFeed[], selfUrl, landingUrl)

  return new Response(xml, {
    status: 200,
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
    },
  })
}
