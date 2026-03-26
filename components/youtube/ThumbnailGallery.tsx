'use client'

import { Check, RefreshCw } from 'lucide-react'

export function ThumbnailGallery({
  thumbnailUrls,
  textOverlays,
  currentThumbnail,
  selectedIndex,
  onSelect,
  onRegenerate,
  regenerating,
}: {
  thumbnailUrls: string[]
  textOverlays?: string[]
  currentThumbnail?: string
  selectedIndex: number | null
  onSelect: (index: number) => void
  onRegenerate?: () => void
  regenerating?: boolean
}) {
  if (!thumbnailUrls || thumbnailUrls.length === 0) return null

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        {thumbnailUrls.map((url, idx) => {
          const isSelected = selectedIndex === idx
          return (
            <button
              key={idx}
              onClick={() => onSelect(idx)}
              className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                isSelected ? 'border-purple-500 ring-2 ring-purple-500/30' : 'border-transparent hover:border-white/20'
              }`}
            >
              <img src={url} alt={`Вариант ${idx + 1}`} className="w-full aspect-video object-cover" />
              {isSelected && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                  <Check className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              {textOverlays?.[idx] && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6">
                  <p className="text-[10px] text-white/80 line-clamp-2">{textOverlays[idx]}</p>
                </div>
              )}
              <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                {idx + 1}
              </div>
            </button>
          )
        })}
      </div>

      {/* Current YouTube thumbnail for comparison */}
      {currentThumbnail && (
        <div className="mt-2">
          <span className="text-[10px] text-white/30 mb-1 block">Текущая обложка YouTube</span>
          <img src={currentThumbnail} alt="Current" className="w-full max-w-[200px] rounded-lg opacity-50" />
        </div>
      )}

      {onRegenerate && (
        <button
          onClick={onRegenerate}
          disabled={regenerating}
          className="mt-3 flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors disabled:opacity-30"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
          Перегенерировать обложки
        </button>
      )}
    </div>
  )
}
