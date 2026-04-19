'use client'

import { useEffect, useState } from 'react'
import { Send, Loader2, Copy, Check, RefreshCw, Sparkles } from 'lucide-react'

interface Candidate {
  hook: string
  body: string
  closing: string
  seed_idea: string
  full_text?: string
}

interface Piece {
  id: string
  status: string
  metadata: { candidates?: Candidate[]; generated_at?: string } | null
  created_at: string
}

interface Props {
  articleId: string
  hasBody: boolean
}

export function ThreadsPanel({ articleId, hasBody }: Props) {
  const [piece, setPiece] = useState<Piece | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/articles/${articleId}/pieces/threads`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (!cancelled) { setPiece(d.piece ?? null); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [articleId])

  async function generate(): Promise<void> {
    if (!hasBody) {
      setError('Сначала напишите тело статьи')
      return
    }
    setGenerating(true)
    setError(null)
    try {
      const res = await fetch(`/api/articles/${articleId}/pieces/threads`, { method: 'POST' })
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

  async function copyToClipboard(text: string, idx: number): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(idx)
      setTimeout(() => setCopied(prev => prev === idx ? null : prev), 1500)
    } catch {
      setError('Не удалось скопировать')
    }
  }

  const candidates = piece?.metadata?.candidates ?? []
  const generatedAt = piece?.metadata?.generated_at

  return (
    <div className="p-4 bg-card border border-border rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-medium text-foreground">Threads</span>
          {generatedAt && (
            <span className="text-[10px] text-muted-foreground/60">
              · последняя генерация {new Date(generatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <button
          onClick={generate}
          disabled={generating || !hasBody}
          className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs flex items-center gap-1.5 disabled:opacity-50 hover:bg-accent/90"
        >
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : candidates.length ? <RefreshCw className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
          {generating ? 'Генерируем...' : candidates.length ? 'Сгенерировать заново' : 'Сгенерировать'}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground/60">
        Стиль <code className="text-muted-foreground">@thedankoe</code> — короткий hook + 1-3 абзаца + афористичный финал. Без эмодзи. 5-7 вариантов из ключевых идей статьи.
      </p>

      {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground/60"><Loader2 className="w-3 h-3 animate-spin" /> Загрузка...</div>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {!loading && candidates.length > 0 && (
        <div className="space-y-2 pt-1">
          {candidates.map((c, i) => {
            const fullText = c.full_text ?? [c.hook, c.body, c.closing].filter(Boolean).join('\n\n')
            return (
              <div key={i} className="p-3 bg-background rounded-lg border border-border/60 hover:border-accent/40 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60 shrink-0">#{i + 1} · {c.seed_idea}</span>
                  <button
                    onClick={() => copyToClipboard(fullText, i)}
                    className="p-1 rounded text-muted-foreground/60 hover:text-foreground shrink-0"
                    title="Скопировать"
                  >
                    {copied === i ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <pre className="text-xs text-foreground leading-relaxed whitespace-pre-wrap font-sans">{fullText}</pre>
                <div className="text-[10px] text-muted-foreground/60 mt-2 tabular-nums">
                  {fullText.split(/\s+/).filter(Boolean).length} слов · {fullText.length} знаков
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && candidates.length === 0 && !error && !generating && (
        <p className="text-[11px] text-muted-foreground/60 italic">
          Ещё не сгенерировано. Нажмите «Сгенерировать» чтобы создать 5-7 вариантов.
        </p>
      )}
    </div>
  )
}
