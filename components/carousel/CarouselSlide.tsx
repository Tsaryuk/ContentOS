'use client'

import type { CarouselSlide as SlideData } from '@/lib/carousel/types'
import { BRAND_PRESETS } from '@/lib/carousel/types'

interface CarouselSlideProps {
  slide: SlideData
  index: number
  total: number
  preset: string
  illustrationUrl?: string | null
}

export function CarouselSlide({ slide, index, total, preset, illustrationUrl }: CarouselSlideProps) {
  const p = BRAND_PRESETS[preset] ?? BRAND_PRESETS.tsaryuk
  const isFirst = index === 0
  const isLast = index === total - 1
  const isDark = !isFirst && !isLast && index % 2 === 0
  const bg = isDark ? p.dark : p.light
  const fg = isDark ? p.light : p.ink
  const fgMuted = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'
  const divColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
  const progressTrack = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'
  const progressFill = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.3)'
  const pct = Math.round(((index + 1) / total) * 100)

  // Cover slide
  if (isFirst) {
    return (
      <div className="relative flex flex-col overflow-hidden" style={{ width: 420, height: 525, background: bg, fontFamily: `'${p.bodyFont}', sans-serif` }}>
        {illustrationUrl && (
          <div className="absolute inset-0">
            <img src={illustrationUrl} className="w-full h-full object-cover opacity-15" alt="" />
          </div>
        )}
        <div className="flex-1 flex flex-col justify-center px-8 py-9 relative z-10">
          {slide.tag && (
            <div className="mb-3.5" style={{ fontFamily: `'${p.bodyFont}', sans-serif`, fontSize: 9, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: fgMuted }}>
              {slide.tag}
            </div>
          )}
          <div className="mb-3.5" style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 32, fontWeight: 900, lineHeight: 0.95, letterSpacing: -1, color: fg }}>
            {slide.title}
          </div>
          {slide.subtitle && (
            <div className="mb-4" style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 14, fontWeight: 300, color: fgMuted }}>
              {slide.subtitle}
            </div>
          )}
          {slide.body && (
            <div style={{ fontSize: 13, lineHeight: 1.55, color: fgMuted, maxWidth: 320 }}>
              {slide.body}
            </div>
          )}
        </div>
        <div className="absolute bottom-4 left-8 right-8 flex items-center gap-2">
          <span style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 9, fontWeight: 600, color: fgMuted, letterSpacing: 1 }}>{p.handle}</span>
        </div>
      </div>
    )
  }

  // CTA slide
  if (isLast) {
    return (
      <div className="relative flex flex-col items-center justify-center" style={{ width: 420, height: 525, background: bg, fontFamily: `'${p.bodyFont}', sans-serif` }}>
        <div className="flex items-center justify-center rounded-full mb-4" style={{ width: 64, height: 64, background: p.ink, fontFamily: `'${p.headFont}', sans-serif`, fontSize: 22, fontWeight: 700, color: p.light }}>
          {p.avatarLetter}
        </div>
        <div className="mb-2" style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 24, fontWeight: 900, color: fg }}>
          {slide.title}
        </div>
        <div className="mb-5" style={{ fontSize: 14, color: fgMuted }}>
          {slide.body || 'Сохрани \u00B7 Поделись \u00B7 Подпишись'}
        </div>
        <div style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 11, fontWeight: 600, color: fgMuted, letterSpacing: 1 }}>
          {p.handle}
        </div>
        <ProgressBar track={progressTrack} fill={progressFill} pct={100} label={`${total}/${total}`} muted={fgMuted} />
      </div>
    )
  }

  // Content slide
  return (
    <div className="relative flex flex-col overflow-hidden" style={{ width: 420, height: 525, background: bg, padding: '30px 28px 40px', fontFamily: `'${p.bodyFont}', sans-serif` }}>
      {slide.tag && (
        <div className="mb-3" style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: fgMuted }}>
          {slide.tag}
        </div>
      )}
      <div className="mb-1" style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 10, fontWeight: 300, letterSpacing: 0.5, color: fgMuted }}>
        {index}.
      </div>
      <div className="mb-3.5" style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 26, fontWeight: 900, lineHeight: 0.95, letterSpacing: -1, color: fg }}>
        {slide.title}
      </div>
      {slide.lead && (
        <div className="mb-1.5" style={{ fontSize: 13, lineHeight: 1.55, color: fgMuted }}>
          {slide.lead}
        </div>
      )}
      {slide.bold && (
        <div className="mb-2.5" style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.55, color: fg }}>
          {slide.bold}
        </div>
      )}
      <div style={{ height: 1, background: divColor, margin: '11px 0' }} />
      <div className="flex gap-4 mb-2.5">
        {slide.label1 && (
          <div className="flex-1">
            <div className="mb-1" style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: fgMuted }}>{slide.label1}</div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: fg }}>{slide.col1}</div>
          </div>
        )}
        {slide.label2 && (
          <div className="flex-1">
            <div className="mb-1" style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: fgMuted }}>{slide.label2}</div>
            <div style={{ fontSize: 12, lineHeight: 1.5, color: fg }}>{slide.col2}</div>
          </div>
        )}
      </div>
      {slide.example && (
        <>
          <div style={{ height: 1, background: divColor, margin: '6px 0 10px' }} />
          <div className="mb-1" style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: fgMuted }}>ПРИМЕР</div>
          <div style={{ fontSize: 12, lineHeight: 1.5, color: fg, fontStyle: 'italic' }}>{slide.example}</div>
        </>
      )}
      <ProgressBar track={progressTrack} fill={progressFill} pct={pct} label={`${index + 1}/${total}`} muted={fgMuted} />
    </div>
  )
}

function ProgressBar({ track, fill, pct, label, muted }: { track: string; fill: string; pct: number; label: string; muted: string }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2" style={{ padding: '12px 26px 16px' }}>
      <div className="flex-1 rounded-sm overflow-hidden" style={{ height: 2, background: track }}>
        <div className="rounded-sm" style={{ height: '100%', width: `${pct}%`, background: fill }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 500, color: muted }}>{label}</span>
    </div>
  )
}
