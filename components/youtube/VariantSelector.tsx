'use client'

import { Star, MessageSquare } from 'lucide-react'

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
  onSelect,
}: {
  variants: TitleVariant[]
  selectedIndex: number | null
  onSelect: (index: number) => void
}) {
  if (!variants || variants.length === 0) return null

  return (
    <div className="space-y-2">
      {variants.map((v, idx) => {
        const isSelected = selectedIndex === idx
        const style = STYLE_LABELS[v.style] ?? { label: v.style, color: 'bg-white/10 text-white/50' }

        return (
          <button
            key={idx}
            onClick={() => onSelect(idx)}
            className={`w-full text-left p-3 rounded-xl border transition-all ${
              isSelected
                ? 'border-purple-500/50 bg-purple-500/10'
                : 'border-white/[0.06] bg-white/[0.02] hover:border-white/10'
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
                </div>
                <p className="text-sm text-white/90 font-medium leading-snug">{v.text}</p>
                <p className="text-[11px] text-white/40 mt-1.5 flex items-start gap-1">
                  <MessageSquare className="w-3 h-3 shrink-0 mt-0.5" />
                  {v.reasoning}
                </p>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
