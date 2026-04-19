/**
 * Public podcast landing — /podcasts/[slug]
 *
 * Design target is glebsolomin.mave.digital: big square cover, show title,
 * description, "listen on" chips, scrollable episode list with native HTML5
 * audio player. Rendered server-side so it works for anonymous visitors and
 * embeds nicely when someone shares the URL.
 */

import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { Rss } from 'lucide-react'

interface PodcastShow {
  id: string
  slug: string
  title: string
  description: string | null
  author: string | null
  cover_url: string | null
  language: string
  category: string | null
  is_active: boolean
}

interface PodcastEpisode {
  id: string
  title: string
  description: string | null
  cover_url: string | null
  audio_url: string
  duration_sec: number | null
  episode_number: number | null
  published_at: string
}

interface ListenLink {
  label: string
  href: string
}

// Platforms that Mave.digital redistributes to. Host doesn't store these
// per-show yet — we render a static shortlist with a link to Mave. Later we
// can move this into podcast_shows.listen_links JSON so each show can override.
const LISTEN_PLATFORMS: ListenLink[] = [
  { label: 'Apple Podcasts', href: 'https://podcasts.apple.com' },
  { label: 'Яндекс.Музыка', href: 'https://music.yandex.ru/podcasts' },
  { label: 'VK Подкасты', href: 'https://vk.com/podcasts' },
  { label: 'Звук', href: 'https://zvuk.com' },
  { label: 'Castbox', href: 'https://castbox.fm' },
  { label: 'Spotify', href: 'https://open.spotify.com' },
]

function formatDuration(sec: number | null): string {
  if (!sec) return ''
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return ''
  }
}

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function PodcastLanding({ params }: PageProps) {
  const { slug } = await params

  const { data: show } = await supabaseAdmin
    .from('podcast_shows')
    .select('id, slug, title, description, author, cover_url, language, category, is_active')
    .eq('slug', slug)
    .maybeSingle<PodcastShow>()

  if (!show || !show.is_active) notFound()

  const { data: episodes } = await supabaseAdmin
    .from('podcast_episodes')
    .select('id, title, description, cover_url, audio_url, duration_sec, episode_number, published_at')
    .eq('show_id', show.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })

  const eps = (episodes ?? []) as PodcastEpisode[]

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-6 py-10 md:py-16">
        {/* Hero */}
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-8 items-start mb-12">
          {show.cover_url ? (
            <img
              src={show.cover_url}
              alt={show.title}
              className="w-full md:w-64 aspect-square rounded-2xl object-cover shadow-card"
            />
          ) : (
            <div className="w-full md:w-64 aspect-square rounded-2xl bg-accent-surface" />
          )}
          <div className="min-w-0">
            {show.category && (
              <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70 font-semibold mb-2">{show.category}</div>
            )}
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mb-2">{show.title}</h1>
            {show.author && (
              <div className="text-sm text-muted-foreground mb-4">{show.author}</div>
            )}
            {show.description && (
              <p className="text-[15px] leading-relaxed text-muted-foreground whitespace-pre-line">{show.description}</p>
            )}

            <div className="mt-6 flex flex-wrap gap-2">
              {LISTEN_PLATFORMS.map(p => (
                <a
                  key={p.label}
                  href={p.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-surface hover:bg-accent-surface/80 text-xs font-medium transition-colors"
                >
                  {p.label}
                </a>
              ))}
              <a
                href={`/podcasts/${show.slug}/feed.xml`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-accent-surface text-xs font-medium transition-colors"
                title="RSS feed"
              >
                <Rss className="w-3.5 h-3.5" /> RSS
              </a>
            </div>
          </div>
        </div>

        {/* Episodes */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-[0.12em] mb-4">
            Эпизоды · {eps.length}
          </h2>

          {eps.length === 0 && (
            <div className="py-16 text-center text-muted-foreground">
              <p className="text-sm">Эпизодов пока нет.</p>
            </div>
          )}

          {eps.map(ep => {
            const cover = ep.cover_url ?? show.cover_url
            return (
              <article key={ep.id} className="p-5 rounded-2xl border border-border bg-card">
                <div className="flex gap-4 items-start">
                  {cover ? (
                    <img src={cover} alt="" className="w-20 h-20 rounded-xl object-cover shrink-0" />
                  ) : (
                    <div className="w-20 h-20 rounded-xl bg-accent-surface shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1.5">
                      {ep.episode_number != null && <span>Эпизод {ep.episode_number}</span>}
                      {ep.episode_number != null && <span>·</span>}
                      <span>{formatDate(ep.published_at)}</span>
                      {ep.duration_sec != null && <span>·</span>}
                      {ep.duration_sec != null && <span>{formatDuration(ep.duration_sec)}</span>}
                    </div>
                    <h3 className="text-base font-semibold tracking-tight mb-2">{ep.title}</h3>
                    {ep.description && (
                      <p className="text-sm text-muted-foreground leading-relaxed line-clamp-3 mb-3">{ep.description}</p>
                    )}
                    <audio controls preload="none" className="w-full" src={ep.audio_url}>
                      Ваш браузер не поддерживает аудио-плеер.
                    </audio>
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        <footer className="mt-16 pt-8 border-t border-border text-xs text-muted-foreground/70 text-center">
          Подписаться в {' '}
          <a
            href={`/podcasts/${show.slug}/feed.xml`}
            className="underline underline-offset-4 hover:text-foreground"
          >
            любом приложении подкастов через RSS
          </a>
        </footer>
      </div>
    </div>
  )
}
