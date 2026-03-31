'use client'

import { useState, useRef, useEffect } from 'react'
import { Star, MessageSquare, Copy, Check, Pencil } from 'lucide-react'

interface TitleVariant {
  text: string
  reasoning: string
  style: string
  is_recommended: boolean
}

const STYLE_LABELS: Record<string, { label: string; color: string }> = {
  hook: { label: 'Hook', color: 'bg-red-500/20 text-red-400' },
  question: { label: 'Вопрос', color: 'bg-blue-500/20 text-blue-400' },
  statement: { label: 'Факт', color: 'bg-emerald-500/20 text-emerald-400' },
  curiosity_gap: { label: 'Интрига', color: 'bg-amber-500/20 text-amber-400' },
  listicle: { label: 'Список', color: 'bg-purple-500/20 text-purple-400' },
}

export function VariantSelector({
  variants,
  selectedIndex,
  editedTitle,
  onSelect,
  onTitleEdit,
}: {
  variants: TitleVariant[]
  selectedIndex: number | null
  editedTitle?: string | null
  onSelect: (index: number) => void
  onTitleEdit?: (text: string) => void
}) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingIdx !== null) inputRef.current?.focus()
  }, [editingIdx])

  if (!variants || variants.length === 0) return null

  function copy(idx: number, text: string) {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 1500)
  }

  function startEdit(idx: number, text: string) {
    setEditingIdx(idx)
    setEditText(editedTitle && idx === selectedIndex ? editedTitle : text)
  }

  function commitEdit(idx: number) {
    setEditingIdx(null)
    if (editText.trim() && onTitleEdit) {
      onSelect(idx)
      onTitleEdit(editText.trim())
    }
  }

  return (
    <div className="space-y-2">
      {variants.map((v, idx) => {
        const isSelected = selectedIndex === idx
        const isEditing = editingIdx === idx
        const displayText = isSelected && editedTitle ? editedTitle : v.text
        const style = STYLE_LABELS[v.style] ?? { label: v.style, color: 'bg-white/10 text-muted' }

        return (
          <div
            key={idx}
            onClick={() => { if (!isEditing) onSelect(idx) }}
            className={`w-full text-left p-3 rounded-xl border transition-all cursor-pointer ${
              isSelected
                ? 'border-purple-500/50 bg-purple-500/10'
                : 'border-border bg-surface hover:border-accent/30'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-5 h-5 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center ${
                isSelected ? 'border-purple-500 bg-purple-500' : 'border-white/20'
              }`}>
                {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${style.color}`}>
                    {style.label}
                  </span>
                  {v.is_recommended && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[10px] font-medium">
                      <Star className="w-3 h-3" /> Рекомендация
                    </span>
                  )}
                  {onTitleEdit && (
                    <button
                      onClick={e => { e.stopPropagation(); startEdit(idx, displayText) }}
                      className="p-1 rounded hover:bg-white/10 transition-colors"
                      title="Редактировать"
                    >
                      <Pencil className="w-3 h-3 text-muted" />
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); copy(idx, displayText) }}
                    className="ml-auto p-1 rounded hover:bg-white/10 transition-colors"
                    title="Копировать заголовок"
                  >
                    {copiedIdx === idx
                      ? <Check className="w-3.5 h-3.5 text-green-400" />
                      : <Copy className="w-3.5 h-3.5 text-muted" />
                    }
                  </button>
                </div>
                {isEditing ? (
                  <input
                    ref={inputRef}
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    onBlur={() => commitEdit(idx)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitEdit(idx)
                      if (e.key === 'Escape') setEditingIdx(null)
                    }}
                    onClick={e => e.stopPropagation()}
                    className="w-full bg-bg border border-accent/40 rounded-lg px-2.5 py-1.5 text-sm text-cream font-medium focus:outline-none focus:border-purple-500/60"
                  />
                ) : (
                  <p className="text-sm text-cream font-medium leading-snug">{displayText}</p>
                )}
                <p className="text-[11px] text-muted mt-1.5 flex items-start gap-1">
                  <MessageSquare className="w-3 h-3 shrink-0 mt-0.5" />
                  {v.reasoning}
                </p>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
