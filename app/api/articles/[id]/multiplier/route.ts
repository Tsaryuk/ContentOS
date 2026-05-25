// Content Multiplier — single-screen view of "what's already been
// produced from this article and what's still missing".
//
// Six channels are reported, each with a `status`:
//   - 'missing' — no row exists yet
//   - 'draft'   — row exists but not yet ready/sent/published
//   - 'ready'   — finished but not published (e.g. generated draft)
//   - 'sent'    — actually published (sent newsletter, tg post sent,
//                 carousel exported, podcast published, etc.)
//
// Three are linked to the article directly (email_issue_id, threads,
// video_script via content_pieces). The other three (carousel,
// tg_post, clip) hang off the source video — we resolve it from
// `nl_articles.youtube_url` if present. No video = those three stay
// 'missing' because they're literally not applicable.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export type MultiplierKind =
  | 'email'
  | 'threads'
  | 'video_script'
  | 'carousel'
  | 'tg_post'
  | 'clip'
  | 'podcast'

export type MultiplierStatus = 'missing' | 'draft' | 'ready' | 'sent'

export interface MultiplierItem {
  kind: MultiplierKind
  status: MultiplierStatus
  /** Optional human label for the row (e.g. issue subject, slide count). */
  hint?: string
  /** Where in the app the user goes when clicking this card. Null for
   *  'missing' rows when no creation endpoint exists yet. */
  href: string | null
  /** Whether this kind can be created from this article (e.g. carousels
   *  only when there's a linked video). */
  available: boolean
}

interface ArticleRow {
  id: string
  email_issue_id: string | null
  youtube_url: string | null
}

function parseYouTubeId(url: string | null): string | null {
  if (!url) return null
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?\s#]+)/)
  return m ? m[1] : null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  const { data: article, error } = await supabaseAdmin
    .from('nl_articles')
    .select('id, email_issue_id, youtube_url')
    .eq('id', id)
    .single<ArticleRow>()

  if (error || !article) {
    return NextResponse.json({ error: 'Статья не найдена' }, { status: 404 })
  }

  // Resolve linked video — needed for carousel/tg/clip/podcast lookups.
  const ytVideoId = parseYouTubeId(article.youtube_url)
  let videoDbId: string | null = null
  if (ytVideoId) {
    const { data: v } = await supabaseAdmin
      .from('yt_videos')
      .select('id')
      .eq('yt_video_id', ytVideoId)
      .maybeSingle<{ id: string }>()
    videoDbId = v?.id ?? null
  }

  // Pull all related rows in parallel — these are short PostgREST queries.
  const [issueRow, threadsRow, scriptRow, carouselRow, tgPostRow, clipRow, podcastRow] = await Promise.all([
    article.email_issue_id
      ? supabaseAdmin
          .from('nl_issues')
          .select('id, subject, status')
          .eq('id', article.email_issue_id)
          .maybeSingle<{ id: string; subject: string; status: string }>()
      : Promise.resolve({ data: null }),
    supabaseAdmin
      .from('content_pieces')
      .select('id, status, content')
      .eq('article_id', id)
      .eq('kind', 'threads')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; status: string; content: string | null }>(),
    supabaseAdmin
      .from('content_pieces')
      .select('id, status, content')
      .eq('article_id', id)
      .eq('kind', 'video_script')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; status: string; content: string | null }>(),
    videoDbId
      ? supabaseAdmin
          .from('carousels')
          .select('id, status, slide_count')
          .eq('video_id', videoDbId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle<{ id: string; status: string; slide_count: number | null }>()
      : Promise.resolve({ data: null }),
    videoDbId
      ? supabaseAdmin
          .from('tg_posts')
          .select('id, status, sent_at')
          .eq('video_id', videoDbId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle<{ id: string; status: string; sent_at: string | null }>()
      : Promise.resolve({ data: null }),
    videoDbId
      ? supabaseAdmin
          .from('clip_candidates')
          .select('id, status')
          .eq('video_id', videoDbId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle<{ id: string; status: string }>()
      : Promise.resolve({ data: null }),
    videoDbId
      ? supabaseAdmin
          .from('podcast_episodes')
          .select('id, status, title, published_at')
          .eq('video_id', videoDbId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle<{ id: string; status: string; title: string | null; published_at: string | null }>()
      : Promise.resolve({ data: null }),
  ])

  // Per-kind status mapping. Distinct table conventions for `status`
  // — we squash them into the four buckets defined by MultiplierStatus.
  function mapIssue(row: typeof issueRow.data): { status: MultiplierStatus; hint?: string } {
    if (!row) return { status: 'missing' }
    if (row.status === 'sent' || row.status === 'scheduled') return { status: 'sent', hint: row.subject }
    if (row.status === 'uploaded') return { status: 'ready', hint: row.subject }
    return { status: 'draft', hint: row.subject }
  }
  function mapPiece(row: { status: string; content: string | null } | null): MultiplierStatus {
    if (!row) return 'missing'
    if (row.status === 'sent' || row.status === 'published') return 'sent'
    if (row.content?.trim()) return 'ready'
    return 'draft'
  }
  function mapCarousel(row: typeof carouselRow.data): MultiplierStatus {
    if (!row) return 'missing'
    if (row.status === 'exported' || row.status === 'published') return 'sent'
    if (row.status === 'rendered') return 'ready'
    return 'draft'
  }
  function mapTgPost(row: typeof tgPostRow.data): MultiplierStatus {
    if (!row) return 'missing'
    if (row.sent_at) return 'sent'
    if (row.status === 'scheduled') return 'ready'
    return 'draft'
  }
  function mapClip(row: typeof clipRow.data): MultiplierStatus {
    if (!row) return 'missing'
    if (row.status === 'rendered' || row.status === 'published') return 'sent'
    if (row.status === 'approved') return 'ready'
    return 'draft'
  }
  function mapPodcast(row: typeof podcastRow.data): { status: MultiplierStatus; hint?: string } {
    if (!row) return { status: 'missing' }
    if (row.published_at) return { status: 'sent', hint: row.title ?? undefined }
    if (row.status === 'ready') return { status: 'ready', hint: row.title ?? undefined }
    return { status: 'draft', hint: row.title ?? undefined }
  }

  const email = mapIssue(issueRow.data)
  const podcast = mapPodcast(podcastRow.data)
  const items: MultiplierItem[] = [
    {
      kind: 'email',
      status: email.status,
      hint: email.hint,
      href: issueRow.data
        ? `/newsletter/editor/${issueRow.data.id}`
        : null,
      available: true,
    },
    {
      kind: 'threads',
      status: mapPiece(threadsRow.data),
      hint: threadsRow.data?.content?.split('\n')[0]?.slice(0, 60),
      href: `/articles/${id}#threads`,
      available: true,
    },
    {
      kind: 'video_script',
      status: mapPiece(scriptRow.data),
      hint: scriptRow.data?.content?.split('\n')[0]?.slice(0, 60),
      href: `/articles/${id}#video-script`,
      available: true,
    },
    {
      kind: 'carousel',
      status: mapCarousel(carouselRow.data),
      hint: carouselRow.data?.slide_count ? `${carouselRow.data.slide_count} слайдов` : undefined,
      href: videoDbId ? `/carousels?videoId=${videoDbId}` : null,
      available: Boolean(videoDbId),
    },
    {
      kind: 'tg_post',
      status: mapTgPost(tgPostRow.data),
      href: videoDbId ? `/telegram?videoId=${videoDbId}` : null,
      available: Boolean(videoDbId),
    },
    {
      kind: 'clip',
      status: mapClip(clipRow.data),
      href: videoDbId ? `/clips?videoId=${videoDbId}` : null,
      available: Boolean(videoDbId),
    },
    {
      kind: 'podcast',
      status: podcast.status,
      hint: podcast.hint,
      href: videoDbId ? `/podcasts?videoId=${videoDbId}` : null,
      available: Boolean(videoDbId),
    },
  ]

  return NextResponse.json({ items, hasVideo: Boolean(videoDbId) })
}
