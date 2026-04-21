'use client'

import { useEffect, useState } from 'react'
import { Play, Loader2, Copy, Check, RefreshCw, Sparkles, Download } from 'lucide-react'

interface Chunk {
  title: string
  text: string
  estimated_minutes: number
}

interface Piece {
  id: string
  content: string | null
  metadata: {
    hook?: string
    closing_line?: string
    estimated_minutes?: number
    word_count?: number
    chunks?: Chunk[]
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
  const [copied, setCopied] = useState<'all' | number | null>(null)

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
        const raw = await res.text().catch(() => '')
        throw new Error(raw.slice(0, 200) || `HTTP ${res.status}`)
      }
      // Server streams zero-width-space keepalive bytes while Claude runs,
      // then writes the final `{piece}` or `{error}` JSON on its own line.
      // Read the whole body, strip keepalives, parse the last JSON block.
      const body = await res.text()
      const cleaned = body.replace(/\u200B/g, '').trim()
      // Pick the last top-level JSON object in the response. Anthropic output
      // is already consumed server-side, so this tail is ours.
      const jsonMatch = cleaned.match(/\{[\s\S]*\}$/)
      if (!jsonMatch) throw new Error('Сервер вернул пустой ответ')
      const d = JSON.parse(jsonMatch[0])
      if (d.error) throw new Error(d.error)
      if (!d.piece) throw new Error('Сервер не вернул piece')
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
      setCopied('all')
      setTimeout(() => setCopied(prev => prev === 'all' ? null : prev), 1500)
    } catch {
      setError('Не удалось скопировать')
    }
  }

  async function copyChunk(text: string, idx: number): Promise<void> {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(idx)
      setTimeout(() => setCopied(prev => prev === idx ? null : prev), 1500)
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
    <div className="p-4 bg-card border border-border rounded-xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-red-400" />
          <span className="text-xs font-medium text-foreground">Сценарий для YouTube</span>
          {meta?.generated_at && (
            <span className="text-[10px] text-muted-foreground/60">
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
      <p className="text-[11px] text-muted-foreground/60">
        Непрерывный текст для суфлёра. Статья превращается в разговорный монолог без заголовков глав — с плавными переходами. Канал «Денис Царюк / Личная стратегия».
      </p>

      {loading && <div className="flex items-center gap-2 text-xs text-muted-foreground/60"><Loader2 className="w-3 h-3 animate-spin" /> Загрузка...</div>}
      {error && <p className="text-xs text-red-400">{error}</p>}

      {!loading && hasContent && meta && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60 tabular-nums">
            <span>≈ {meta.estimated_minutes ?? '?'} мин речи</span>
            <span>·</span>
            <span>{meta.word_count ?? '?'} слов</span>
            {meta.chunks && meta.chunks.length > 0 && (<><span>·</span><span>{meta.chunks.length} блок{meta.chunks.length === 1 ? '' : meta.chunks.length < 5 ? 'а' : 'ов'}</span></>)}
            <div className="flex-1" />
            <button onClick={copyAll} className="px-2 py-1 text-muted-foreground/60 hover:text-foreground flex items-center gap-1">
              {copied === 'all' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />} Скопировать
            </button>
            <button onClick={downloadTxt} className="px-2 py-1 text-muted-foreground/60 hover:text-foreground flex items-center gap-1">
              <Download className="w-3 h-3" /> .txt
            </button>
          </div>

          {meta.hook && (
            <details className="text-[11px] text-muted-foreground/60 bg-background rounded-lg p-2 border border-border/60">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Хук (первые 5-7 секунд)</summary>
              <p className="mt-1.5 text-foreground text-xs leading-relaxed">{meta.hook}</p>
            </details>
          )}

          {/* Chunk-per-card rendering — 2-min blocks with titles for teleprompter.
              Falls back to single-block when metadata.chunks is missing (legacy pieces). */}
          {meta.chunks && meta.chunks.length > 0 ? (
            <div className="space-y-3">
              {meta.chunks.map((chunk, idx) => {
                const words = chunk.text.split(/\s+/).filter(Boolean).length
                return (
                  <div key={idx} className="rounded-lg border border-border/60 bg-background overflow-hidden">
                    <div className="px-3 py-2 border-b border-border/60 flex items-center gap-2 bg-card/40">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-accent tabular-nums shrink-0">
                        Блок {idx + 1}
                      </span>
                      <span className="text-xs text-foreground truncate flex-1">{chunk.title}</span>
                      <span className="text-[10px] text-muted-foreground/60 tabular-nums shrink-0">
                        ≈ {chunk.estimated_minutes} мин · {words} слов
                      </span>
                      <button
                        onClick={() => copyChunk(chunk.text, idx)}
                        className="p-1 rounded text-muted-foreground/60 hover:text-foreground"
                        title="Скопировать блок"
                      >
                        {copied === idx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    </div>
                    <pre className="p-3 text-sm text-foreground leading-7 whitespace-pre-wrap font-sans max-h-72 overflow-y-auto">
                      {chunk.text}
                    </pre>
                  </div>
                )
              })}
            </div>
          ) : (
            <pre className="p-3 bg-background rounded-lg border border-border/60 text-xs text-foreground leading-relaxed whitespace-pre-wrap font-sans max-h-96 overflow-y-auto">
              {piece.content}
            </pre>
          )}
        </div>
      )}

      {!loading && !hasContent && !error && !generating && (
        <p className="text-[11px] text-muted-foreground/60 italic">
          Ещё не сгенерировано. Нажмите «Сгенерировать» чтобы создать сценарий.
        </p>
      )}
    </div>
  )
}
