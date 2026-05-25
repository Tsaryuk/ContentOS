'use client'

// Idea Inbox — quick-capture page for article ideas.
//
// Flow:
//   1. Type / paste a raw thought into the top input.
//   2. POST /api/ideas → server runs Anthropic and returns the row with
//      3 title suggestions + tags + angle prompts + similar-articles
//      warnings already populated.
//   3. Each idea card shows the suggestions. "Развернуть в статью"
//      promotes it to a real nl_articles draft and navigates.
//
// Status filter (sidebar): new (unprocessed), drafted (already became
// articles, but we kept the idea around), archived (dismissed).

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, Sparkles, Send, Trash2, Archive, ExternalLink, FileText } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast, toastConfirm } from '@/lib/toast'

interface Similar {
  id: string
  title: string
  blog_slug: string | null
  overlap_reason: string
}

interface Idea {
  id: string
  raw_thought: string
  ai_titles: string[]
  ai_tags: string[]
  ai_angles: string[]
  similar_to: Similar[]
  status: 'new' | 'drafted' | 'archived'
  promoted_article_id: string | null
  created_at: string
}

type FilterStatus = 'new' | 'drafted' | 'archived' | 'all'

export default function IdeaInboxPage() {
  const router = useRouter()
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('new')
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [promoting, setPromoting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = filter === 'all' ? '' : `?status=${filter}`
      const res = await fetch(`/api/ideas${qs}`)
      const data = await res.json()
      setIdeas(data.ideas ?? [])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  async function captureIdea() {
    if (!input.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_thought: input.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? `Ошибка ${res.status}`)
        return
      }
      setIdeas((prev) => [data.idea, ...prev])
      setInput('')
      toast.success('Идея захвачена')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось')
    } finally {
      setSubmitting(false)
    }
  }

  async function promote(idea: Idea, title?: string) {
    if (promoting) return
    setPromoting(idea.id)
    try {
      const res = await fetch(`/api/ideas/${idea.id}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      const data = await res.json()
      if (!res.ok || !data.article?.id) {
        toast.error(data.error ?? `Ошибка ${res.status}`)
        return
      }
      router.push(`/articles/${data.article.id}`)
    } finally {
      setPromoting(null)
    }
  }

  async function setStatus(id: string, status: Idea['status']) {
    const res = await fetch(`/api/ideas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? 'Не удалось')
      return
    }
    setIdeas((prev) => prev.filter((i) => filter === 'all' || i.status === status ? true : i.id !== id))
    if (status === 'archived') toast.success('В архив')
  }

  async function destroy(id: string) {
    const ok = await toastConfirm('Удалить идею навсегда?', {
      okLabel: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    await fetch(`/api/ideas/${id}`, { method: 'DELETE' })
    setIdeas((prev) => prev.filter((i) => i.id !== id))
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2 uppercase tracking-wider">
          <span>ContentOS</span>
          <span className="w-1 h-1 rounded-full bg-border" />
          <span className="normal-case tracking-normal">Идеи</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight">Идея-инбокс</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Кинь сюда сырую мысль — AI предложит 3 заголовка, теги и углы. Потом одним кликом разверни в статью.
        </p>
      </header>

      {/* Capture */}
      <Card className="p-4 mb-6">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              captureIdea()
            }
          }}
          placeholder="Что вертится в голове? Можно одной строкой, можно абзацем. Cmd+Enter — сохранить."
          rows={3}
          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
        <div className="flex items-center justify-between mt-3">
          <span className="text-[11px] text-muted-foreground">
            {input.length > 0 ? `${input.length} символов` : 'Подсказка: пиши как себе в заметку'}
          </span>
          <Button
            variant="brand"
            onClick={captureIdea}
            disabled={submitting || !input.trim()}
          >
            {submitting ? <Loader2 className="animate-spin" /> : <Sparkles />}
            Захватить
          </Button>
        </div>
      </Card>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4">
        {(['new', 'drafted', 'archived', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
              filter === f
                ? 'bg-accent/10 text-accent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {f === 'new' && 'Новые'}
            {f === 'drafted' && 'В статьях'}
            {f === 'archived' && 'Архив'}
            {f === 'all' && 'Все'}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-4 w-3/4 mb-3" />
              <Skeleton className="h-3 w-full mb-2" />
              <Skeleton className="h-3 w-1/2" />
            </Card>
          ))}
        </div>
      ) : ideas.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center">
          <Sparkles className="w-8 h-8 text-muted-foreground mb-3" />
          <p className="text-foreground font-medium mb-1">
            {filter === 'new' ? 'Идей нет — кинь что-то в инбокс' : 'Пусто'}
          </p>
          {filter === 'archived' && (
            <p className="text-xs text-muted-foreground">Архив пока пустой.</p>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          {ideas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              promoting={promoting === idea.id}
              onPromote={(title) => promote(idea, title)}
              onArchive={() => setStatus(idea.id, 'archived')}
              onUnarchive={() => setStatus(idea.id, 'new')}
              onDelete={() => destroy(idea.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface IdeaCardProps {
  idea: Idea
  promoting: boolean
  onPromote: (title?: string) => void
  onArchive: () => void
  onUnarchive: () => void
  onDelete: () => void
}

function IdeaCard({ idea, promoting, onPromote, onArchive, onUnarchive, onDelete }: IdeaCardProps) {
  const isDrafted = idea.status === 'drafted'
  const isArchived = idea.status === 'archived'

  return (
    <Card className={`p-4 ${isArchived ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="text-sm text-foreground whitespace-pre-wrap flex-1">{idea.raw_thought}</div>
        <div className="flex items-center gap-1 shrink-0">
          {isDrafted && idea.promoted_article_id && (
            <Link
              href={`/articles/${idea.promoted_article_id}`}
              title="Открыть созданную статью"
              className="p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded"
            >
              <FileText className="w-3.5 h-3.5" />
            </Link>
          )}
          {!isArchived ? (
            <button onClick={onArchive} title="В архив" className="p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-accent-surface rounded">
              <Archive className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button onClick={onUnarchive} title="Вернуть из архива" className="p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-accent-surface rounded">
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onDelete} title="Удалить навсегда" className="p-1.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* AI titles */}
      {idea.ai_titles.length > 0 && !isDrafted && (
        <div className="space-y-1.5 mb-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Заголовки</div>
          {idea.ai_titles.map((t, i) => (
            <button
              key={i}
              onClick={() => onPromote(t)}
              disabled={promoting}
              className="w-full text-left px-3 py-2 rounded-lg border border-border hover:border-accent hover:bg-accent/5 transition-colors text-sm text-foreground disabled:opacity-50 flex items-center gap-2"
            >
              <Send className="w-3 h-3 text-accent shrink-0" />
              <span className="flex-1">{t}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tags + angles */}
      <div className="flex flex-wrap items-start gap-3 text-[11px]">
        {idea.ai_tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {idea.ai_tags.map((tag) => (
              <span key={tag} className="px-2 py-0.5 rounded-full bg-accent/10 text-accent uppercase tracking-wider text-[10px]">
                {tag}
              </span>
            ))}
          </div>
        )}
        {idea.ai_angles.length > 0 && (
          <details className="text-muted-foreground/80 grow">
            <summary className="cursor-pointer hover:text-foreground">Углы ({idea.ai_angles.length})</summary>
            <ul className="mt-1.5 space-y-1 pl-3">
              {idea.ai_angles.map((a, i) => (
                <li key={i} className="text-foreground/80 list-disc list-inside">{a}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Similar warning */}
      {idea.similar_to.length > 0 && (
        <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="text-[10px] uppercase tracking-wider text-amber-500 mb-1">
            Возможно перекликается
          </div>
          {idea.similar_to.map((s) => (
            <Link
              key={s.id}
              href={`/articles/${s.id}`}
              className="flex items-start gap-1.5 text-xs text-foreground hover:text-accent"
            >
              <ExternalLink className="w-3 h-3 mt-0.5 shrink-0" />
              <span>
                <span className="font-medium">«{s.title}»</span>
                {s.overlap_reason && <span className="text-muted-foreground"> — {s.overlap_reason}</span>}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}
