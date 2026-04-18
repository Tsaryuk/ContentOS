'use client'

import { useEffect, useState } from 'react'
import { Play, Loader2, Copy, Check, RefreshCw, Sparkles, Download } from 'lucide-react'

interface Piece {
  id: string
  content: string | null
  metadata: {
    hook?: string
    closing_line?: string
    estimated_minutes?: number
    word_count?: number
    generated_at?: string
  } | null
  created_at: string
}

interface Props {
  articleId: string
  articleTitle: string
  hasBody: boolean
}

export function VideoScriptPanel({ articleId, articleTitle, hasBody }: Props) {
  const [piece, setPiece] = useState<Piece | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/articles/${articleId}/pieces/video-script`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (!cancelled) { setPiece(d.piece ?? null); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [articleId])

  async function generate(): Promise<void> {
    if (!hasBody) { setError('Сначала напишите тело статьи'); return }
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/articles/${articleId}/pieces/video-script`, { method: 'POST' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      const d = await res.json()
      setPiece(d.piece)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка генерации')
    } finally {
      setGenerating(false)
    }
  }

  async function copyAll(): Promise<void> {
    if (!piece?.content) return
    try {
      await navigator.clipboard.writeText(piece.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Не удалось скопировать')
    }
  }

  function downloadTxt(): void {
    if (!piece?.content) return
    const safeTitle = (articleTitle || 'video-script').replace(/[^a-zA-Zа-яА-Я0-9-]+/g, '-').slice(0, 60)
    const blob = new Blob([piece.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeTitle}-scenarij.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const hasContent = Boolean(piece?.content?.trim())
  const meta = piece?.metadata

  return (
    <div className="p-4 bg-surface border border-border rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-red-400" />
          <span className="text-xs font-medium text-cream">Сценарий для YouTube</span>
          {meta?.generated_at && (
            <span className="text-[10px] text-dim">
              · {new Date(meta.generated_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <button
          onClick={generate}
          disabled={generating || !hasBody}
          className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs flex items-center gap-1.5 disabled:opacity-50 hover:bg-accent/90"
        >
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : hasContent ? <RefreshCw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
          {generating ? 'Генерируем...' : hasContent ? 'Сгенерировать заново' : 'Сгенерировать'}
        </button>
      </div>
      <p className="text-[11px] text-dim">
        Непрерывный текст для суфлёра. Статья превращается в разговорный монолог без заголовков глав — с плавными переходами. Канал «Денис Царюк / Личная стратегия».
      </p>

      {loading && <div className="flex items-center gap-2 text-xs text-dim"><Loader2 className="w-3 h-3 animate-spin" /> Загрузка...</div>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {!loading && hasContent && meta && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-[11px] text-dim tabular-nums">
            <span>≈ {meta.estimated_minutes ?? '?'} мин речи</span>
            <span>·</span>
            <span>{meta.word_count ?? '?'} слов</span>
            <div className="flex-1" />
            <button onClick={copyAll} className="px-2 py-1 text-dim hover:text-cream flex items-center gap-1">
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} Скопировать
            </button>
            <button onClick={downloadTxt} className="px-2 py-1 text-dim hover:text-cream flex items-center gap-1">
              <Download className="w-3 h-3" /> .txt
            </button>
          </div>

          {meta.hook && (
            <details className="text-[11px] text-dim bg-bg rounded-lg p-2 border border-border/60">
              <summary className="cursor-pointer text-muted hover:text-cream">Хук (первые 5-7 секунд)</summary>
              <p className="mt-1.5 text-cream text-xs leading-relaxed">{meta.hook}</p>
            </details>
          )}

          <pre className="p-3 bg-bg rounded-lg border border-border/60 text-xs text-cream leading-relaxed whitespace-pre-wrap font-sans max-h-96 overflow-y-auto">
            {piece.content}
          </pre>
        </div>
      )}

      {!loading && !hasContent && !error && !generating && (
        <p className="text-[11px] text-dim italic">
          Ещё не сгенерировано. Нажмите «Сгенерировать» чтобы создать сценарий.
        </p>
      )}
    </div>
  )
}
