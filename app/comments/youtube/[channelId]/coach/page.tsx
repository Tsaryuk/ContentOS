'use client'

// Reply Coach — diff between the AI draft and the final reply that was
// sent, so the author can see "where I edit the AI" and rate each pair
// 👍/👎. The rating signal feeds a weekly job (separate PR) that updates
// channel.rules.comments.tone with patterns from the good ones.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, ThumbsUp, ThumbsDown, Loader2, MessageSquare } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'

interface LogItem {
  id: string
  reply_text: string
  ai_draft: string | null
  feedback: 'good' | 'bad' | 'neutral' | null
  mode: 'auto' | 'manual'
  created_at: string
  comment_text: string | null
  comment_author: string | null
  yt_comment_id: string | null
  video_title: string | null
  yt_video_id: string | null
}

type Filter = 'all' | 'edited' | 'auto' | 'unrated'

export default function ReplyCoachPage() {
  const params = useParams<{ channelId: string }>()
  const channelId = params.channelId

  const [items, setItems] = useState<LogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('edited')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/comments/log?channelId=${channelId}&limit=100&days=30`)
      const data = await res.json()
      setItems((data.items ?? []) as LogItem[])
    } finally {
      setLoading(false)
    }
  }, [channelId])

  useEffect(() => { load() }, [load])

  async function setFeedback(id: string, next: 'good' | 'bad' | null) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, feedback: next ?? null } : it)))
    await fetch(`/api/comments/log/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedback: next === null ? '' : next }),
    })
  }

  // Quick-and-dirty diff: highlight lines that differ. Char-level diff
  // would be nicer but for short replies line-level is enough signal.
  const filtered = items.filter((it) => {
    if (filter === 'all') return true
    if (filter === 'unrated') return !it.feedback
    if (filter === 'edited') return it.ai_draft && it.ai_draft.trim() !== it.reply_text.trim()
    if (filter === 'auto') return it.mode === 'auto'
    return true
  })

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <Link
        href={`/comments/youtube/${channelId}`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-3 h-3" /> Назад к каналу
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1">Reply Coach</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Сравни AI-draft и финальный ответ. Оценивай 👍/👎 — раз в неделю
        AI обновит «тон» канала по итогам твоих оценок.
      </p>

      <div className="flex items-center gap-1 mb-4">
        {(['edited', 'unrated', 'auto', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
              filter === f
                ? 'bg-accent/10 text-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'edited' && 'Поправлено руками'}
            {f === 'unrated' && 'Без оценки'}
            {f === 'auto' && 'Авто-ответы'}
            {f === 'all' && 'Все'}
          </button>
        ))}
        <div className="ml-auto text-[11px] text-muted-foreground">
          {filtered.length} из {items.length}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4 space-y-2">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-16 w-full" />
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<MessageSquare />}
          title="Нечего показывать"
          description={
            filter === 'edited' ? 'Ты пока ничего не правил руками — все ответы ушли как AI их написал.'
              : filter === 'unrated' ? 'Все ответы уже оценены.'
              : filter === 'auto' ? 'Auto-reply не отправлял ответов в последние 30 дней.'
              : 'История пустая за последние 30 дней.'
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((it) => (
            <CoachCard key={it.id} item={it} onFeedback={setFeedback} />
          ))}
        </div>
      )}
    </div>
  )
}

function CoachCard({
  item,
  onFeedback,
}: {
  item: LogItem
  onFeedback: (id: string, next: 'good' | 'bad' | null) => void
}) {
  const draft = item.ai_draft?.trim() ?? ''
  const final = item.reply_text.trim()
  const edited = Boolean(draft) && draft !== final

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-2">
            <span>@{item.comment_author ?? 'unknown'}</span>
            <span>·</span>
            <span className="truncate">{item.video_title ?? ''}</span>
            <span>·</span>
            <span>{item.mode === 'auto' ? 'auto' : 'manual'}</span>
            {edited && <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 uppercase text-[9px] tracking-wider">edited</span>}
          </div>
          <blockquote className="text-sm text-foreground/80 border-l-2 border-border pl-3">
            {item.comment_text}
          </blockquote>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onFeedback(item.id, item.feedback === 'good' ? null : 'good')}
            title="Хороший ответ — учиться на нём"
            className={`p-2 rounded-lg transition-colors ${
              item.feedback === 'good'
                ? 'bg-emerald-500/15 text-emerald-500'
                : 'text-muted-foreground/60 hover:text-emerald-500 hover:bg-emerald-500/10'
            }`}
          >
            <ThumbsUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => onFeedback(item.id, item.feedback === 'bad' ? null : 'bad')}
            title="Плохой ответ — не повторять"
            className={`p-2 rounded-lg transition-colors ${
              item.feedback === 'bad'
                ? 'bg-destructive/15 text-destructive'
                : 'text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10'
            }`}
          >
            <ThumbsDown className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
            AI-draft
          </div>
          <div className={`text-sm rounded-lg p-3 ${draft ? 'bg-card border border-border' : 'text-muted-foreground/60 italic'}`}>
            {draft || '(AI-draft не сохранён — ответ был полностью ручной)'}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
            Отправлено
          </div>
          <div className={`text-sm rounded-lg p-3 ${edited ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-card border border-border'}`}>
            {final}
          </div>
        </div>
      </div>
    </Card>
  )
}
