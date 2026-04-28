'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, ExternalLink, Sparkles, RefreshCw,
  AlertTriangle, ArrowLeft, Loader2, EyeOff, Tag,
} from 'lucide-react'
import { Card } from '@/components/ui/card'

interface Classification {
  category?: string
  sentiment?: string
  has_question?: boolean
  toxicity?: number
  language?: string
  skip_reason?: string | null
}

const CATEGORY_LABEL: Record<string, string> = {
  question: 'вопрос',
  opinion: 'мнение',
  gratitude: 'благодарность',
  disagreement: 'несогласие',
  off_topic: 'оффтоп',
  spam: 'спам',
  toxic: 'токсичный',
}

const CATEGORY_TONE: Record<string, string> = {
  question: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
  opinion: 'bg-violet-500/10 text-violet-600 dark:text-violet-300',
  gratitude: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  disagreement: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  off_topic: 'bg-muted text-muted-foreground',
  spam: 'bg-red-500/10 text-red-600 dark:text-red-300',
  toxic: 'bg-red-500/10 text-red-600 dark:text-red-300',
}

interface QueueComment {
  id: string
  yt_comment_id: string
  text: string
  author_name: string
  author_avatar: string | null
  published_at: string | null
  like_count: number
  parent_comment_id: string | null
  ai_reply_draft: string | null
  classification: Classification | null
  kind: 'top_level' | 'reply_to_us'
  parent_reply_text: string | null
  video: {
    id: string
    yt_video_id: string
    title: string | null
    thumbnail: string | null
  }
}

interface Stats {
  daily_used: number
  daily_limit: number
  queue_size: number
  replied_today: number
  replied_total: number
  auto_reply: boolean
  kill_switch: boolean
}

interface ChannelInfo {
  id: string
  title: string
  rules: { comments?: { telegram_url?: string; tone?: string } } | null
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - Date.parse(iso)
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'только что'
  if (m < 60) return `${m} мин назад`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ч назад`
  const d = Math.floor(h / 24)
  return `${d} дн назад`
}

export default function ChannelCommentsPage() {
  const params = useParams<{ channelId: string }>()
  const channelId = params.channelId

  const [channel, setChannel] = useState<ChannelInfo | null>(null)
  const [comments, setComments] = useState<QueueComment[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)
  const [skipping, setSkipping] = useState<string | null>(null)
  const [classifying, setClassifying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [parentExpanded, setParentExpanded] = useState<string | null>(null)

  const loadAll = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [channelRes, queueRes, statsRes] = await Promise.all([
        fetch(`/api/channels/${channelId}`).then((r) => r.json()),
        fetch(`/api/comments/queue?platform=youtube&channelId=${channelId}&limit=20`).then((r) => r.json()),
        fetch(`/api/channels/${channelId}/comments-stats`).then((r) => r.json()),
      ])
      setChannel(channelRes)
      const qs: QueueComment[] = queueRes.comments ?? []
      setComments(qs)
      setStats(statsRes)
      const initialDrafts: Record<string, string> = {}
      for (const c of qs) {
        if (c.ai_reply_draft) initialDrafts[c.id] = c.ai_reply_draft
      }
      setDrafts(initialDrafts)
      setActiveIndex(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [channelId])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const active = comments[activeIndex]

  async function generateDraft(c: QueueComment) {
    setGenerating(c.id)
    setError(null)
    try {
      const res = await fetch('/api/comments/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: c.yt_comment_id, videoId: c.video.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Ошибка генерации')
      setDrafts((d) => ({ ...d, [c.id]: data.draft }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации')
    } finally {
      setGenerating(null)
    }
  }

  async function skipComment(c: QueueComment) {
    setSkipping(c.id)
    setError(null)
    try {
      const res = await fetch(`/api/comments/${c.id}/skip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'manual' }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Ошибка скрытия')
      }
      setComments((cs) => cs.filter((x) => x.id !== c.id))
      setActiveIndex((i) => Math.min(i, comments.length - 2))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка скрытия')
    } finally {
      setSkipping(null)
    }
  }

  async function classifyOne(c: QueueComment) {
    setClassifying(c.id)
    setError(null)
    try {
      const res = await fetch(`/api/comments/${c.id}/classify`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Ошибка классификации')
      const cls = data.classification as Classification | null
      if (cls?.skip_reason) {
        setComments((cs) => cs.filter((x) => x.id !== c.id))
        setActiveIndex((i) => Math.min(i, comments.length - 2))
      } else {
        setComments((cs) => cs.map((x) => (x.id === c.id ? { ...x, classification: cls } : x)))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка классификации')
    } finally {
      setClassifying(null)
    }
  }

  async function sendReply(c: QueueComment) {
    const text = drafts[c.id]?.trim()
    if (!text) {
      setError('Сначала сгенерируй или впиши ответ.')
      return
    }
    setSending(c.id)
    setError(null)
    try {
      const res = await fetch('/api/comments/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commentId: c.yt_comment_id,
          videoId: c.video.id,
          text,
          mode: 'manual',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Ошибка отправки')
      setComments((cs) => cs.filter((x) => x.id !== c.id))
      setActiveIndex((i) => Math.min(i, comments.length - 2))
      const newStats = await fetch(`/api/channels/${channelId}/comments-stats`).then((r) => r.json())
      setStats(newStats)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка отправки')
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <Link
        href="/comments"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-3 h-3" /> Все каналы
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {channel?.title ?? 'Канал'}
          </h1>
          <p className="text-xs text-muted-foreground mt-1">YouTube · комментарии</p>
        </div>
        <div className="flex items-center gap-3">
          {stats?.kill_switch && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-300">
              <AlertTriangle className="w-3 h-3" /> Авто-ответы выключены глобально
            </div>
          )}
          <button
            onClick={loadAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-accent-surface transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Обновить
          </button>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Unanswered Comments</h2>
          {stats && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {comments.length} в очереди · {stats.replied_total} всего отправлено
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-12 text-sm text-muted-foreground text-center">
            <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
            Загружаем очередь...
          </div>
        ) : comments.length === 0 ? (
          <div className="py-16 text-sm text-muted-foreground text-center">
            Очередь пуста. Все комментарии обработаны.
          </div>
        ) : active ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  {active.author_avatar ? (
                    <img src={active.author_avatar} className="w-8 h-8 rounded-full shrink-0" alt="" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="text-sm font-medium text-foreground">@{active.author_name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {timeAgo(active.published_at)}
                      </span>
                      {active.kind === 'reply_to_us' && (
                        <span className="text-[9px] uppercase tracking-wider bg-accent/10 text-accent px-1.5 py-0.5 rounded">
                          ответ нам
                        </span>
                      )}
                      {active.classification?.category && (
                        <span
                          className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${CATEGORY_TONE[active.classification.category] ?? 'bg-muted text-muted-foreground'}`}
                        >
                          {CATEGORY_LABEL[active.classification.category] ?? active.classification.category}
                        </span>
                      )}
                    </div>
                    {active.kind === 'reply_to_us' && active.parent_reply_text && (
                      <button
                        onClick={() => setParentExpanded((p) => (p === active.id ? null : active.id))}
                        className="text-[11px] text-muted-foreground hover:text-foreground mb-1"
                      >
                        {parentExpanded === active.id ? '▼' : '▶'} Твой предыдущий ответ
                      </button>
                    )}
                    {parentExpanded === active.id && active.parent_reply_text && (
                      <div className="text-xs text-muted-foreground border-l-2 border-border pl-2 mb-1.5 italic">
                        {active.parent_reply_text}
                      </div>
                    )}
                    <p className="text-sm text-foreground whitespace-pre-wrap">{active.text}</p>
                  </div>
                </div>

                <div className="border-t border-border pt-3">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 block">
                    Ответ AI (можно отредактировать)
                  </label>
                  <textarea
                    value={drafts[active.id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [active.id]: e.target.value }))}
                    placeholder={drafts[active.id] === undefined ? 'Нажми «Сгенерировать», чтобы получить вариант ответа' : ''}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  />
                  <div className="flex items-center justify-between mt-2 gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => generateDraft(active)}
                        disabled={generating === active.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border hover:bg-accent-surface disabled:opacity-50 transition-colors"
                      >
                        {generating === active.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Sparkles className="w-3 h-3" />
                        )}
                        {drafts[active.id] ? 'Перегенерировать' : 'Сгенерировать'}
                      </button>
                      {!active.classification && (
                        <button
                          onClick={() => classifyOne(active)}
                          disabled={classifying === active.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border hover:bg-accent-surface disabled:opacity-50 transition-colors"
                          title="Прогнать классификатор: вопрос/мнение/спам и т.д."
                        >
                          {classifying === active.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Tag className="w-3 h-3" />
                          )}
                          Классифицировать
                        </button>
                      )}
                      <button
                        onClick={() => skipComment(active)}
                        disabled={skipping === active.id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border border-border hover:bg-accent-surface disabled:opacity-50 transition-colors"
                        title="Скрыть комментарий из очереди"
                      >
                        {skipping === active.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <EyeOff className="w-3 h-3" />
                        )}
                        Скрыть
                      </button>
                    </div>
                    <a
                      href={`https://www.youtube.com/watch?v=${active.video.yt_video_id}&lc=${active.yt_comment_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="w-3 h-3" /> Открыть в YouTube
                    </a>
                  </div>
                </div>
              </div>

              <a
                href={`https://www.youtube.com/watch?v=${active.video.yt_video_id}`}
                target="_blank"
                rel="noreferrer"
                className="block group"
              >
                {active.video.thumbnail ? (
                  <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                    <img
                      src={active.video.thumbnail}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                ) : (
                  <div className="aspect-video rounded-lg bg-muted" />
                )}
                <div className="text-xs text-foreground mt-1.5 line-clamp-2 group-hover:text-accent transition-colors">
                  {active.video.title}
                </div>
              </a>
            </div>

            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
                disabled={activeIndex === 0}
                className="p-2 rounded-lg border border-border hover:bg-accent-surface disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Предыдущий"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1.5">
                {comments.slice(0, 10).map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveIndex(i)}
                    className={`h-1.5 rounded-full transition-all ${
                      i === activeIndex ? 'w-6 bg-accent' : 'w-1.5 bg-muted hover:bg-muted-foreground/40'
                    }`}
                    aria-label={`К комментарию ${i + 1}`}
                  />
                ))}
                {comments.length > 10 && (
                  <span className="text-[10px] text-muted-foreground ml-1">+{comments.length - 10}</span>
                )}
              </div>

              <button
                onClick={() => setActiveIndex((i) => Math.min(comments.length - 1, i + 1))}
                disabled={activeIndex >= comments.length - 1}
                className="p-2 rounded-lg border border-border hover:bg-accent-surface disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Следующий"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => sendReply(active)}
              disabled={sending === active.id || !drafts[active.id]?.trim() || (stats ? stats.daily_used >= stats.daily_limit : false)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-accent to-purple shadow-md shadow-accent/20 hover:shadow-lg hover:shadow-accent/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {sending === active.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Send AI Reply
            </button>

            {stats && (
              <div className="text-center">
                <div className="text-[11px] text-muted-foreground tabular-nums">
                  {stats.daily_used}/{stats.daily_limit} replies used today
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                  AI can make mistakes. Review the response before sending.
                </div>
              </div>
            )}
          </div>
        ) : null}

        {error && (
          <div className="mt-4 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
            {error}
          </div>
        )}
      </Card>
    </div>
  )
}
