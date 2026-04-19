'use client'

import { useState } from 'react'
import { Search, ChevronDown, ChevronUp, Download, Copy, Check } from 'lucide-react'

interface TranscriptChunk {
  start: number
  end: number
  text: string
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function buildFormattedTranscript(chunks: TranscriptChunk[]): string {
  return chunks.map(c => `[${formatTime(c.start)}]\n${c.text}`).join('\n\n')
}

export function TranscriptViewer({
  chunks,
  transcript,
  videoTitle,
}: {
  chunks: TranscriptChunk[] | null
  transcript: string | null
  videoTitle?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)

  if (!transcript) {
    return (
      <div className="text-muted-foreground/60 text-sm py-8 text-center">
        Транскрипт ещё не создан. Нажмите &quot;Транскрибировать&quot;.
      </div>
    )
  }

  const hasChunks = chunks && chunks.length > 0
  const formatted = hasChunks ? buildFormattedTranscript(chunks) : transcript

  const filtered = hasChunks && search
    ? chunks.filter(c => c.text.toLowerCase().includes(search.toLowerCase()))
    : chunks

  const previewChunks = hasChunks ? chunks.slice(0, 5) : []
  const displayChunks = expanded ? (filtered ?? []) : previewChunks
  const totalSegments = chunks?.length ?? 0

  const handleDownload = () => {
    const blob = new Blob([formatted], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${videoTitle ?? 'transcript'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(formatted)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      {/* Header with actions */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground/60">
          {totalSegments} сегментов
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-md hover:bg-card transition-colors text-muted-foreground hover:text-white/70"
            title="Копировать"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 rounded-md hover:bg-card transition-colors text-muted-foreground hover:text-white/70"
            title="Скачать .txt"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search (only when expanded) */}
      {expanded && hasChunks && (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
          <input
            type="text"
            placeholder="Поиск по транскрипту..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-purple-500/50"
          />
        </div>
      )}

      {/* Chunks */}
      {hasChunks ? (
        <>
          <div className={`${expanded ? 'max-h-[600px] overflow-y-auto' : ''} space-y-0.5`}>
            {displayChunks.map((chunk, idx) => (
              <div key={idx} className="flex gap-3 py-1 hover:bg-card rounded px-2 -mx-2 transition-colors">
                <span className="text-[11px] text-purple-400 font-mono shrink-0 pt-0.5 w-12">
                  {formatTime(chunk.start)}
                </span>
                <span className="text-[13px] text-muted-foreground leading-relaxed">{chunk.text}</span>
              </div>
            ))}
          </div>

          {/* Expand/Collapse toggle */}
          {totalSegments > 5 && (
            <button
              onClick={() => { setExpanded(!expanded); setSearch('') }}
              className="mt-3 w-full py-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-muted-foreground hover:bg-card rounded-lg transition-colors"
            >
              {expanded ? (
                <><ChevronUp className="w-3.5 h-3.5" /> Свернуть</>
              ) : (
                <><ChevronDown className="w-3.5 h-3.5" /> Показать все {totalSegments} сегментов</>
              )}
            </button>
          )}
        </>
      ) : (
        <div className="text-muted-foreground text-sm whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
          {transcript.slice(0, 500)}{transcript.length > 500 ? '...' : ''}
        </div>
      )}
    </div>
  )
}
