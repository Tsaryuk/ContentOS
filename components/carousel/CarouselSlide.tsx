'use client'

import type { CarouselSlide as SlideData, CarouselStyle } from '@/lib/carousel/types'
import { BRAND_PRESETS } from '@/lib/carousel/types'

interface CarouselSlideProps {
  slide: SlideData
  index: number
  total: number
  preset: string
  illustrationUrl?: string | null
  style?: CarouselStyle | null
}

export function CarouselSlide({ slide, index, total, preset, illustrationUrl, style }: CarouselSlideProps) {
  const p = BRAND_PRESETS[preset] ?? BRAND_PRESETS.tsaryuk
  const isFirst = index === 0
  const isLast = index === total - 1
  const isDark = !isFirst && !isLast && index % 2 === 0

  const accentColor = style?.accentColor ?? p.accent
  const bgTint = style?.bgTint ?? p.light

  const bg = isDark ? p.dark : bgTint
  const fg = isDark ? bgTint : p.ink
  const fgMuted = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.45)'
  const divColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'
  const progressTrack = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)'
  const progressFill = accentColor
  const pct = Math.round(((index + 1) / total) * 100)

  // Cover slide
  if (isFirst) {
    return (
      <div className="relative flex flex-col overflow-hidden" style={{ width: 420, height: 525, background: bg, fontFamily: `'${p.bodyFont}', sans-serif` }}>
        {illustrationUrl && (
          <div className="absolute inset-0">
            <img src={illustrationUrl} className="w-full h-full object-cover" style={{ opacity: 0.2 }} alt="" />
            <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, ${bg}00 0%, ${bg}cc 70%, ${bg} 100%)` }} />
          </div>
        )}
        <div className="flex-1 flex flex-col justify-end px-8 pb-12 relative z-10">
          {slide.tag && (
            <div className="mb-3" style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: accentColor }}>
              {slide.tag}
            </div>
          )}
          <div className="mb-3" style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 30, fontWeight: 900, lineHeight: 0.95, letterSpacing: -1, color: fg }}>
            {slide.title}
          </div>
          {slide.subtitle && (
            <div className="mb-3" style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 13, fontWeight: 300, color: fgMuted }}>
              {slide.subtitle}
            </div>
          )}
          {slide.body && (
            <div style={{ fontSize: 12, lineHeight: 1.55, color: fgMuted, maxWidth: 300 }}>
              {slide.body}
            </div>
          )}
          <div className="mt-4 flex items-center gap-2">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ background: p.ink, color: bgTint, fontFamily: `'${p.headFont}', sans-serif` }}>
              {p.avatarLetter}
            </div>
            <span style={{ fontSize: 9, fontWeight: 600, color: fgMuted, letterSpacing: 0.5 }}>{p.handle}</span>
          </div>
        </div>
      </div>
    )
  }

  // CTA slide
  if (isLast) {
    return (
      <div className="relative flex flex-col items-center justify-center" style={{ width: 420, height: 525, background: bg, fontFamily: `'${p.bodyFont}', sans-serif` }}>
        <div className="flex items-center justify-center rounded-full mb-4" style={{ width: 56, height: 56, background: accentColor, fontFamily: `'${p.headFont}', sans-serif`, fontSize: 20, fontWeight: 700, color: bg }}>
          {p.avatarLetter}
        </div>
        <div className="mb-2" style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 22, fontWeight: 900, color: fg }}>
          {slide.title}
        </div>
        <div className="mb-5" style={{ fontSize: 13, color: fgMuted }}>
          {slide.body || 'Сохрани \u00B7 Поделись \u00B7 Подпишись'}
        </div>
        <div style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 10, fontWeight: 600, color: accentColor, letterSpacing: 1 }}>
          {p.handle}
        </div>
        <ProgressBar track={progressTrack} fill={progressFill} pct={100} label={`${total}/${total}`} muted={fgMuted} />
      </div>
    )
  }

  // Content slide — with illustration
  return (
    <div className="relative flex flex-col overflow-hidden" style={{ width: 420, height: 525, background: bg, fontFamily: `'${p.bodyFont}', sans-serif` }}>
      {/* Illustration area */}
      {illustrationUrl && (
        <div className="relative shrink-0" style={{ height: 160 }}>
          <img src={illustrationUrl} className="w-full h-full object-cover" alt="" />
          <div className="absolute inset-0" style={{ background: `linear-gradient(to bottom, transparent 40%, ${bg} 100%)` }} />
        </div>
      )}

      <div className="flex-1 flex flex-col" style={{ padding: illustrationUrl ? '0 28px 40px' : '28px 28px 40px' }}>
        <div className="flex items-center gap-2 mb-2">
          {slide.tag && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: accentColor }}>
              {slide.tag}
            </span>
          )}
          <span style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 9, fontWeight: 300, color: fgMuted }}>
            {index}.
          </span>
        </div>

        <div className="mb-2.5" style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: illustrationUrl ? 22 : 26, fontWeight: 900, lineHeight: 0.95, letterSpacing: -0.5, color: fg }}>
          {slide.title}
        </div>

        {slide.lead && (
          <div className="mb-1" style={{ fontSize: 12, lineHeight: 1.5, color: fgMuted }}>
            {slide.lead}
          </div>
        )}
        {slide.bold && (
          <div className="mb-2" style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.5, color: fg }}>
            {slide.bold}
          </div>
        )}

        <div style={{ height: 1, background: divColor, margin: '8px 0' }} />

        <div className="flex gap-4 mb-2">
          {slide.label1 && (
            <div className="flex-1">
              <div className="mb-1" style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: accentColor }}>{slide.label1}</div>
              <div style={{ fontSize: 11, lineHeight: 1.45, color: fg }}>{slide.col1}</div>
            </div>
          )}
          {slide.label2 && (
            <div className="flex-1">
              <div className="mb-1" style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: accentColor }}>{slide.label2}</div>
              <div style={{ fontSize: 11, lineHeight: 1.45, color: fg }}>{slide.col2}</div>
            </div>
          )}
        </div>

        {slide.example && (
          <>
            <div style={{ height: 1, background: divColor, margin: '4px 0 8px' }} />
            <div className="mb-1" style={{ fontSize: 8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: accentColor }}>ПРИМЕР</div>
            <div style={{ fontSize: 11, lineHeight: 1.45, color: fg, fontStyle: 'italic' }}>{slide.example}</div>
          </>
        )}
      </div>

      <ProgressBar track={progressTrack} fill={progressFill} pct={pct} label={`${index + 1}/${total}`} muted={fgMuted} />
    </div>
  )
}

function ProgressBar({ track, fill, pct, label, muted }: { track: string; fill: string; pct: number; label: string; muted: string }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2" style={{ padding: '12px 26px 14px' }}>
      <div className="flex-1 rounded-sm overflow-hidden" style={{ height: 2, background: track }}>
        <div className="rounded-sm" style={{ height: '100%', width: `${pct}%`, background: fill }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 500, color: muted }}>{label}</span>
    </div>
  )
}
