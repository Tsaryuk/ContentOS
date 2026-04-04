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

  const accentColor = style?.accentColor ?? '#1C1A17'
  const bg = '#FFFFFF'
  const ink = '#111111'
  const muted = '#6B6B6B'
  const align = slide.align ?? 'left'
  const textAlign = align as 'left' | 'center' | 'right'

  const pct = Math.round(((index + 1) / total) * 100)

  // ── COVER SLIDE ──────────────────────────────────────────────────────────
  if (isFirst) {
    return (
      <div
        className="relative flex flex-col overflow-hidden"
        style={{ width: 420, height: 525, background: bg, fontFamily: `'${p.bodyFont}', sans-serif` }}
      >
        {/* Text area — top */}
        <div className="px-8 pt-8 flex-shrink-0" style={{ textAlign }}>
          {slide.tag && (
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: accentColor, marginBottom: 8 }}>
              {slide.tag}
            </div>
          )}
          <div style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 28, fontWeight: 900, lineHeight: 1.05, letterSpacing: -0.5, color: ink, marginBottom: 10 }}>
            {slide.title}
          </div>
          {slide.subtitle && (
            <div style={{ fontSize: 13, lineHeight: 1.5, color: muted, fontWeight: 400 }}>
              {slide.subtitle}
            </div>
          )}
          {slide.lead && (
            <div style={{ fontSize: 13, lineHeight: 1.5, color: muted, marginTop: 4 }}>
              {slide.lead}
            </div>
          )}
          {/* Handle */}
          <div className="flex items-center gap-1.5 mt-4" style={{ justifyContent: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start' }}>
            <div
              className="rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
              style={{ width: 18, height: 18, background: ink, color: bg, fontFamily: `'${p.headFont}', sans-serif` }}
            >
              {p.avatarLetter}
            </div>
            <span style={{ fontSize: 9, fontWeight: 600, color: muted, letterSpacing: 0.3 }}>{p.handle}</span>
          </div>
        </div>

        {/* Illustration — bottom fills remaining space */}
        <div className="flex-1 relative mt-4 overflow-hidden">
          {illustrationUrl ? (
            <img src={illustrationUrl} alt="" className="w-full h-full object-cover object-top" />
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: '#F5F4F0' }}>
              <span style={{ fontSize: 48 }}>✦</span>
            </div>
          )}
        </div>

        <ProgressBar pct={pct} label={`${index + 1}/${total}`} accent={accentColor} />
      </div>
    )
  }

  // ── CTA SLIDE ─────────────────────────────────────────────────────────────
  if (isLast) {
    return (
      <div
        className="relative flex flex-col items-center justify-center"
        style={{ width: 420, height: 525, background: bg, fontFamily: `'${p.bodyFont}', sans-serif`, padding: '0 48px' }}
      >
        {/* Author photo or letter avatar */}
        <div
          className="rounded-full flex items-center justify-center overflow-hidden mb-5 shrink-0"
          style={{ width: 72, height: 72, background: ink, border: `2px solid ${ink}` }}
        >
          {p.photoUrl ? (
            <img src={p.photoUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span style={{ fontSize: 22, fontWeight: 700, color: bg, fontFamily: `'${p.headFont}', sans-serif` }}>
              {p.avatarLetter}
            </span>
          )}
        </div>

        {/* CTA text */}
        <div style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 9, fontWeight: 700, letterSpacing: 2.5, textTransform: 'uppercase', color: muted, textAlign: 'center', marginBottom: 10 }}>
          ПОНРАВИЛСЯ ПОСТ?
        </div>

        <div style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 22, fontWeight: 900, lineHeight: 1.1, color: ink, textAlign: 'center', marginBottom: 8 }}>
          {slide.title}
        </div>

        <div style={{ fontSize: 14, color: muted, textAlign: 'center', marginBottom: 16 }}>
          {slide.body || 'Сохрани · Поделись'}
        </div>

        {/* Divider */}
        <div style={{ width: 32, height: 1, background: '#E5E5E5', marginBottom: 14 }} />

        <div style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 11, fontWeight: 700, color: ink, letterSpacing: 0.5 }}>
          {p.handle}
        </div>

        <ProgressBar pct={100} label={`${total}/${total}`} accent={accentColor} />
      </div>
    )
  }

  // ── CONTENT SLIDE ─────────────────────────────────────────────────────────
  const ILLUST_H = 265

  return (
    <div
      className="relative flex flex-col overflow-hidden"
      style={{ width: 420, height: 525, background: bg, fontFamily: `'${p.bodyFont}', sans-serif` }}
    >
      {/* Illustration — top 50% */}
      <div className="relative shrink-0 overflow-hidden" style={{ height: ILLUST_H }}>
        {illustrationUrl ? (
          <img src={illustrationUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: '#F5F4F0' }} />
        )}
      </div>

      {/* Text area — bottom */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ padding: '14px 28px 40px', textAlign }}>

        {/* Slide number + tag */}
        <div className="flex items-center gap-2 mb-2" style={{ justifyContent: textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start' }}>
          {slide.tag && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: accentColor }}>
              {slide.tag}
            </span>
          )}
          <span style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 9, fontWeight: 400, color: '#BDBDBD' }}>
            {index}/{total - 1}
          </span>
        </div>

        {/* Title */}
        <div style={{ fontFamily: `'${p.headFont}', sans-serif`, fontSize: 20, fontWeight: 900, lineHeight: 1.05, letterSpacing: -0.3, color: ink, marginBottom: 8 }}>
          {slide.title}
        </div>

        {/* Lead / body */}
        {slide.lead && (
          <div style={{ fontSize: 12, lineHeight: 1.55, color: muted }}>
            {slide.lead}
          </div>
        )}
        {slide.bold && (
          <div style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.5, color: ink, marginTop: 4 }}>
            {slide.bold}
          </div>
        )}
        {slide.body && !slide.lead && (
          <div style={{ fontSize: 12, lineHeight: 1.55, color: muted }}>
            {slide.body}
          </div>
        )}

        {/* Two-column labels */}
        {(slide.label1 || slide.label2) && (
          <div className="flex gap-4 mt-2">
            {slide.label1 && (
              <div className="flex-1">
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: accentColor, marginBottom: 2 }}>{slide.label1}</div>
                <div style={{ fontSize: 11, lineHeight: 1.4, color: ink }}>{slide.col1}</div>
              </div>
            )}
            {slide.label2 && (
              <div className="flex-1">
                <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: accentColor, marginBottom: 2 }}>{slide.label2}</div>
                <div style={{ fontSize: 11, lineHeight: 1.4, color: ink }}>{slide.col2}</div>
              </div>
            )}
          </div>
        )}

        {slide.example && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #F0EFEB' }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: accentColor, marginBottom: 2 }}>ПРИМЕР</div>
            <div style={{ fontSize: 11, lineHeight: 1.45, color: muted, fontStyle: 'italic' }}>{slide.example}</div>
          </div>
        )}
      </div>

      <ProgressBar pct={pct} label={`${index}/${total - 1}`} accent={accentColor} />
    </div>
  )
}

function ProgressBar({ pct, label, accent }: { pct: number; label: string; accent: string }) {
  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-2" style={{ padding: '10px 24px 12px' }}>
      <div className="flex-1 rounded-full overflow-hidden" style={{ height: 2, background: '#EBEBEB' }}>
        <div className="rounded-full" style={{ height: '100%', width: `${pct}%`, background: accent }} />
      </div>
      <span style={{ fontSize: 9, fontWeight: 600, color: '#BDBDBD' }}>{label}</span>
    </div>
  )
}
