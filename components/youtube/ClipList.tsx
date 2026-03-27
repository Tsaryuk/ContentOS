'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Scissors, Film, Zap } from 'lucide-react'

interface TitleVariant {
  text: string
  reasoning: string
  style: string
  is_recommended: boolean
}

interface ClipSuggestion {
  start: number
  end: number
  title_variants: TitleVariant[]
  description: string
  tags: string[]
  thumbnail_prompt: string
  why_it_works: string
  type: 'clip' | 'short'
  hook_text?: string
}

function fmtTime(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

function fmtDuration(start: number, end: number): string {
  const dur = end - start
  const m = Math.floor(dur / 60)
  const s = dur % 60
  return m > 0 ? `${m} мин ${s > 0 ? s + ' сек' : ''}` : `${s} сек`
}

function ClipCard({
  clip,
  index,
  isSelected,
  onToggle,
}: {
  clip: ClipSuggestion
  index: number
  isSelected: boolean
  onToggle: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isShort = clip.type === 'short'
  const recommended = clip.title_variants?.find(t => t.is_recommended) ?? clip.title_variants?.[0]

  return (
    <div className={`rounded-xl border transition-colors ${
      isSelected ? 'border-purple-500/30 bg-purple-500/5' : 'border-border bg-surface'
    }`}>
      <div className="p-3 flex items-start gap-3">
        {/* Checkbox */}
        <button onClick={onToggle} className="mt-0.5 shrink-0">
          <div className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${
            isSelected ? 'border-purple-500 bg-purple-500' : 'border-border'
          }`}>
            {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
          </div>
        </button>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
              isShort ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'
            }`}>
              {isShort ? <><Film className="w-3 h-3 inline mr-0.5" />Short</> : <><Scissors className="w-3 h-3 inline mr-0.5" />Клип</>}
            </span>
            <span className="text-[10px] text-dim font-mono">
              {fmtTime(clip.start)} — {fmtTime(clip.end)} ({fmtDuration(clip.start, clip.end)})
            </span>
          </div>

          {/* Title */}
          <p className="text-sm text-cream font-medium">{recommended?.text ?? 'Без заголовка'}</p>

          {/* Why it works */}
          <p className="text-[11px] text-muted mt-1 flex items-start gap-1">
            <Zap className="w-3 h-3 shrink-0 mt-0.5 text-amber-400" />
            {clip.why_it_works}
          </p>

          {/* Hook text for shorts */}
          {isShort && clip.hook_text && (
            <p className="text-[11px] text-pink-400/60 mt-1 italic">Hook: &ldquo;{clip.hook_text}&rdquo;</p>
          )}

          {/* Expand button */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-2 flex items-center gap-1 text-[11px] text-dim hover:text-muted transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? 'Свернуть' : 'Подробнее'}
          </button>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-2 space-y-2 border-t border-border pt-2">
              {/* All title variants */}
              {clip.title_variants?.length > 1 && (
                <div>
                  <span className="text-[10px] text-dim block mb-1">Варианты заголовков:</span>
                  {clip.title_variants.map((t, i) => (
                    <p key={i} className="text-[11px] text-muted pl-2 border-l border-border mb-1">
                      {t.text} {t.is_recommended && <span className="text-amber-400 text-[9px]">★</span>}
                    </p>
                  ))}
                </div>
              )}

              {/* Description */}
              <div>
                <span className="text-[10px] text-dim block mb-1">Описание:</span>
                <p className="text-[11px] text-muted">{clip.description}</p>
              </div>

              {/* Tags */}
              {clip.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {clip.tags.map((tag, i) => (
                    <span key={i} className="px-1.5 py-0.5 bg-surface rounded text-[10px] text-muted">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ClipList({
  clips,
  shorts,
  selectedClips,
  selectedShorts,
  onToggleClip,
  onToggleShort,
}: {
  clips: ClipSuggestion[]
  shorts: ClipSuggestion[]
  selectedClips: number[]
  selectedShorts: number[]
  onToggleClip: (index: number) => void
  onToggleShort: (index: number) => void
}) {
  const hasClips = clips && clips.length > 0
  const hasShorts = shorts && shorts.length > 0

  if (!hasClips && !hasShorts) return null

  return (
    <div className="space-y-4">
      {hasClips && (
        <div>
          <h4 className="text-xs text-muted mb-2 flex items-center gap-1.5">
            <Scissors className="w-3.5 h-3.5" /> Клипы ({clips.length})
          </h4>
          <div className="space-y-2">
            {clips.map((clip, idx) => (
              <ClipCard
                key={idx}
                clip={clip}
                index={idx}
                isSelected={selectedClips.includes(idx)}
                onToggle={() => onToggleClip(idx)}
              />
            ))}
          </div>
        </div>
      )}

      {hasShorts && (
        <div>
          <h4 className="text-xs text-muted mb-2 flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5" /> Shorts ({shorts.length})
          </h4>
          <div className="space-y-2">
            {shorts.map((clip, idx) => (
              <ClipCard
                key={idx}
                clip={clip}
                index={idx}
                isSelected={selectedShorts.includes(idx)}
                onToggle={() => onToggleShort(idx)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
