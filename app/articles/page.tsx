'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, Loader2, RefreshCw, Trash2, Globe, Eye } from 'lucide-react'

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
    if (!confirm('Удалить статью?')) return
    await fetch(`/api/articles/${id}`, { method: 'DELETE' })
    fetchArticles()
  }

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-dim" /></div>

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-semibold text-cream">Статьи</h1>
          <span className="text-xs text-dim px-2 py-0.5 bg-white/5 rounded-full">{articles.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchArticles} className="p-2 text-dim hover:text-muted"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={handleCreate} className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs hover:bg-accent/90 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Новая статья
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <FileText className="w-10 h-10 text-dim mb-3" />
            <p className="text-muted mb-1">Нет статей</p>
            <p className="text-xs text-dim mb-4">Создайте первую статью для блога</p>
            <button onClick={handleCreate} className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Создать статью
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {articles.map(a => (
              <div key={a.id} onClick={() => router.push(`/articles/${a.id}`)}
                className="flex items-center gap-4 p-4 bg-surface border border-border rounded-xl hover:border-accent/30 cursor-pointer transition-colors">
                {a.cover_url
                  ? <img src={a.cover_url} className="w-24 h-16 rounded-lg object-cover shrink-0" alt="" />
                  : <div className="w-24 h-16 rounded-lg bg-border shrink-0" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-cream truncate">{a.title || 'Без заголовка'}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                      a.status === 'published' ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-dim'
                    }`}>{a.status === 'published' ? 'Опубликовано' : 'Черновик'}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {a.category && <span className="text-[10px] text-accent/60">{a.category}</span>}
                    <span className="text-[10px] text-dim">{formatDate(a.published_at ?? a.created_at)}</span>
                    {a.blog_slug && a.status === 'published' && (
                      <a href={`https://letters.tsaryuk.ru/articles/${a.blog_slug}.html`} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()} className="text-[10px] text-accent flex items-center gap-1 hover:underline">
                        <Eye className="w-3 h-3" /> На сайте
                      </a>
                    )}
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); handleDelete(a.id) }}
                  className="p-2 text-dim hover:text-red-400 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
