'use client'

import { useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Heart, MessageCircle, Send, Bookmark } from 'lucide-react'
import { CarouselSlide } from './CarouselSlide'
import type { CarouselSlide as SlideData, CarouselStyle } from '@/lib/carousel/types'
import { BRAND_PRESETS } from '@/lib/carousel/types'

interface CarouselPreviewProps {
  slides: SlideData[]
  preset: string
  illustrationUrls?: Record<number, string> | null
  style?: CarouselStyle | null
  onSlideChange?: (index: number) => void
}

export function CarouselPreview({ slides, preset, illustrationUrls, style, onSlideChange }: CarouselPreviewProps) {
  const [currentSlide, setCurrentSlide] = useState(0)
  const p = BRAND_PRESETS[preset] ?? BRAND_PRESETS.tsaryuk

  const goTo = useCallback((idx: number) => {
    const next = Math.max(0, Math.min(idx, slides.length - 1))
    setCurrentSlide(next)
    onSlideChange?.(next)
  }, [slides.length, onSlideChange])

  if (slides.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">Превью карусели</div>
        <div className="bg-white dark:bg-[#1a1a1a] rounded-xl overflow-hidden" style={{ width: 420, boxShadow: '0 4px 32px rgba(0,0,0,0.12)' }}>
          <div className="flex items-center justify-center" style={{ width: 420, height: 525, background: '#F7F5F0' }}>
            <div className="text-center">
              <div className="w-14 h-14 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center mx-auto mb-3 text-2xl">
                ✦
              </div>
              <div className="text-xs font-semibold text-gray-400 max-w-[200px] leading-relaxed">
                Введи тему и нажми<br />&laquo;Сгенерировать&raquo;
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const accentColor = style?.accentColor ?? p.ink

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center justify-between" style={{ width: 420 }}>
        <div className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">Превью карусели</div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => goTo(currentSlide - 1)} className="w-7 h-7 rounded-md border border-border bg-bg-card flex items-center justify-center hover:border-gray-400 transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-semibold text-muted-foreground min-w-[36px] text-center">
            {currentSlide + 1}/{slides.length}
          </span>
          <button onClick={() => goTo(currentSlide + 1)} className="w-7 h-7 rounded-md border border-border bg-bg-card flex items-center justify-center hover:border-gray-400 transition-colors">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Instagram Frame */}
      <div className="bg-white dark:bg-[#1a1a1a] rounded-xl overflow-hidden" style={{ width: 420, boxShadow: '0 4px 32px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)' }}>
        {/* IG Header */}
        <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-gray-100 dark:border-gray-800">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: accentColor, fontFamily: `'${p.headFont}', sans-serif` }}>
            {p.avatarLetter}
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">{p.handle}</div>
          </div>
          <div className="ml-auto text-gray-400 text-lg">&middot;&middot;&middot;</div>
        </div>

        {/* Carousel viewport */}
        <div className="overflow-hidden" style={{ width: 420, height: 525 }}>
          <div className="flex h-full transition-transform duration-300 ease-out" style={{ transform: `translateX(-${currentSlide * 420}px)` }}>
            {slides.map((slide, i) => (
              <div key={i} className="shrink-0" style={{ width: 420, height: 525 }}>
                <CarouselSlide
                  slide={slide}
                  index={i}
                  total={slides.length}
                  preset={preset}
                  illustrationUrl={illustrationUrls?.[i] ?? null}
                  style={style}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-1 py-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="w-1.5 h-1.5 rounded-full transition-colors"
              style={{ background: i === currentSlide ? accentColor : '#ddd' }}
            />
          ))}
        </div>

        {/* IG Actions */}
        <div className="flex items-center px-3 py-1.5 gap-3.5">
          <Heart className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          <MessageCircle className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          <Send className="w-5 h-5 text-gray-700 dark:text-gray-300" />
          <Bookmark className="w-5 h-5 text-gray-700 dark:text-gray-300 ml-auto" />
        </div>
      </div>
    </div>
  )
}
