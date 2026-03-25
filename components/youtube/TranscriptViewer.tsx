'use client'

import { useState } from 'react'
import { Search } from 'lucide-react'

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

export function TranscriptViewer({
  chunks,
  transcript,
}: {
  chunks: TranscriptChunk[] | null
  transcript: string | null
}) {
  const [search, setSearch] = useState('')

  if (!transcript) {
    return (
      <div className="text-white/30 text-sm py-8 text-center">
        Транскрипт ещё не создан. Нажмите "Транскрибировать".
      </div>
    )
  }

  if (!chunks || chunks.length === 0) {
    return (
      <div className="text-white/60 text-sm whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
        {transcript}
      </div>
    )
  }

  const filtered = search
    ? chunks.filter(c => c.text.toLowerCase().includes(search.toLowerCase()))
    : chunks

  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
        <input
          type="text"
          placeholder="Поиск по транскрипту..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-purple-500/50"
        />
      </div>
      <div className="max-h-96 overflow-y-auto space-y-1">
        {filtered.map((chunk, idx) => (
          <div key={idx} className="flex gap-3 py-1.5 hover:bg-white/5 rounded px-2 -mx-2 transition-colors">
            <span className="text-xs text-purple-400 font-mono shrink-0 pt-0.5 w-12">
              {formatTime(chunk.start)}
            </span>
            <span className="text-sm text-white/70 leading-relaxed">{chunk.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
