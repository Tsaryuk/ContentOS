'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, Loader2, RefreshCw, Trash2, Eye } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { toastConfirm } from '@/lib/toast'

interface Article {
  id: string; title: string; subtitle: string; category: string | null
  status: string; cover_url: string | null; published_at: string | null
  created_at: string; blog_slug: string | null
}

export default function ArticlesPage() {
  const router = useRouter()
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)

  const fetchArticles = useCallback(async () => {
    const res = await fetch('/api/articles')
    const data = await res.json()
    if (data.articles) setArticles(data.articles)
  }, [])

  useEffect(() => { fetchArticles().then(() => setLoading(false)) }, [fetchArticles])

  async function handleCreate() {
    const res = await fetch('/api/articles', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '' }),
    })
    const data = await res.json()
    if (data.article) router.push(`/articles/${data.article.id}`)
  }

  async function handleDelete(id: string) {
    const ok = await toastConfirm('Удалить статью?', {
      okLabel: 'Удалить',
      destructive: true,
    })
    if (!ok) return
    await fetch(`/api/articles/${id}`, { method: 'DELETE' })
    fetchArticles()
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2 uppercase tracking-wider">
            <span>ContentOS</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="normal-case tracking-normal">Блог</span>
          </div>
          <h1 className="display-serif text-3xl md:text-4xl font-normal text-foreground tracking-tight">Статьи</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {loading ? 'Загружаем…' : `${articles.length} ${articles.length === 1 ? 'статья' : articles.length < 5 ? 'статьи' : 'статей'} · публикуются на letters.tsaryuk.ru`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={fetchArticles} title="Обновить">
            <RefreshCw />
          </Button>
          <Button variant="brand" onClick={handleCreate}>
            <Plus />
            Новая статья
          </Button>
        </div>
      </header>

      {loading ? (
        // Mirror the real card shape (cover + two text rows) so the
        // page doesn't collapse-and-reflow when data lands.
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="flex items-center gap-4 p-4">
              <Skeleton className="w-16 h-16 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </Card>
          ))}
        </div>
      ) : articles.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Пока нет статей"
          description="Создай первую статью для блога — или зайди в Идеи, там AI поможет начать."
          action={
            <Button variant="brand" onClick={handleCreate}>
              <Plus />
              Создать статью
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3">
          {articles.map(a => (
            <Card
              key={a.id}
              onClick={() => router.push(`/articles/${a.id}`)}
              className="flex items-center gap-4 p-4 hover:shadow-card-hover transition-shadow cursor-pointer"
            >
              {a.cover_url
                ? <img src={a.cover_url} className="w-24 h-16 rounded-lg object-cover shrink-0" alt="" />
                : <div className="w-24 h-16 rounded-lg bg-muted/50 shrink-0" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{a.title || 'Без заголовка'}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                    a.status === 'published'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                      : 'bg-muted/60 text-muted-foreground'
                  }`}>
                    {a.status === 'published' ? 'Опубликовано' : 'Черновик'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                  {a.category && <span className="text-accent/70">{a.category}</span>}
                  <span>{formatDate(a.published_at ?? a.created_at)}</span>
                  {a.blog_slug && a.status === 'published' && (
                    <a
                      href={`https://letters.tsaryuk.ru/articles/${a.blog_slug}.html`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-accent hover:underline"
                    >
                      <Eye className="w-3 h-3" /> На сайте
                    </a>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={e => { e.stopPropagation(); handleDelete(a.id) }}
                className="text-muted-foreground hover:text-destructive shrink-0"
                title="Удалить"
              >
                <Trash2 />
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
