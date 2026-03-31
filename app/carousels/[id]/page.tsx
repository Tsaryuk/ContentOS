'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Copy, Check, Download, Image, Loader2, RefreshCw, Save } from 'lucide-react'
import { CarouselPreview } from '@/components/carousel/CarouselPreview'
import type { CarouselRow, CarouselSlide } from '@/lib/carousel/types'

export default function CarouselEditorPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [carousel, setCarousel] = useState<CarouselRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [isIllustrating, setIsIllustrating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'slides' | 'caption' | 'export'>('slides')
  const [currentSlide, setCurrentSlide] = useState(0)
  const [illustPrompt, setIllustPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch(`/api/carousel/get?id=${id}`)
      .then(r => r.json())
      .then(data => { if (data.carousel) setCarousel(data.carousel) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  const slides: CarouselSlide[] = carousel?.slides ?? []

  // Auto-save slides on change (debounced)
  const saveSlides = useCallback(async (updatedSlides: CarouselSlide[]) => {
    if (!carousel?.id) return
    if (saveTimer.current) clearTimeout(saveTimer.current)

    saveTimer.current = setTimeout(async () => {
      setIsSaving(true)
      await fetch('/api/carousel/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: carousel.id, slides: updatedSlides }),
      })
      setIsSaving(false)
    }, 1000)
  }, [carousel?.id])

  const updateSlide = useCallback((index: number, field: keyof CarouselSlide, value: string) => {
    setCarousel(prev => {
      if (!prev?.slides) return prev
      const updated = prev.slides.map((s, i) =>
        i === index ? { ...s, [field]: value } : s
      )
      saveSlides(updated)
      return { ...prev, slides: updated }
    })
  }, [saveSlides])

  const handleIllustrate = useCallback(async () => {
    if (!carousel?.id) return
    setIsIllustrating(true)
    setError(null)

    try {
      const res = await fetch('/api/carousel/illustrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carouselId: carousel.id,
          prompt: illustPrompt || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setCarousel(prev => prev ? {
        ...prev,
        illustration_urls: data.urls,
        illustration_url: data.urls?.[0] ?? prev.illustration_url,
      } : null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setIsIllustrating(false)
    }
  }, [carousel?.id, illustPrompt])

  const handleExport = useCallback(async () => {
    if (!carousel?.id) return
    setIsExporting(true)
    setError(null)

    try {
      const res = await fetch('/api/carousel/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carouselId: carousel.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setCarousel(prev => prev ? { ...prev, export_urls: data.urls, status: 'exported' } : null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setIsExporting(false)
    }
  }, [carousel?.id])

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }, [])

  if (loading) return <div className="flex items-center justify-center h-screen text-sm text-muted">Загрузка...</div>
  if (!carousel) return <div className="flex items-center justify-center h-screen text-sm text-muted">Карусель не найдена</div>

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="h-12 bg-bg-surface border-b border-border flex items-center px-4 gap-3 shrink-0">
        <button onClick={() => router.push('/carousels')} className="text-muted hover:text-cream">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-semibold truncate max-w-[200px]">{carousel.topic}</span>
        <span className="text-[10px] text-muted">
          {carousel.status === 'ready' ? 'Готово' : carousel.status === 'exported' ? 'Экспортировано' : carousel.status}
        </span>
        {isSaving && <span className="text-[10px] text-accent ml-auto flex items-center gap-1"><Save className="w-3 h-3" /> Сохраняю...</span>}
      </div>

      {/* 3-panel workspace */}
      <div className="flex-1 grid grid-cols-[280px_1fr_300px] overflow-hidden">

        {/* LEFT — Slide list with inline editing */}
        <div className="bg-bg-surface border-r border-border overflow-y-auto p-3 space-y-2">
          <div className="text-[9px] font-semibold tracking-widest uppercase text-muted mb-2">Слайды ({slides.length})</div>
          {slides.map((slide, i) => {
            const isFirst = i === 0
            const isLast = i === slides.length - 1
            const isActive = currentSlide === i

            return (
              <div
                key={i}
                onClick={() => setCurrentSlide(i)}
                className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                  isActive ? 'border-accent bg-accent/5' : 'border-border hover:border-gray-400'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-semibold tracking-wider uppercase text-muted">
                    {isFirst ? 'Обложка' : isLast ? 'CTA' : `${i}.`}
                  </span>
                  {slide.tag && <span className="text-[9px] text-accent">{slide.tag}</span>}
                </div>
                <input
                  value={slide.title}
                  onChange={e => updateSlide(i, 'title', e.target.value)}
                  className="w-full text-xs font-bold bg-transparent outline-none mb-1"
                  onClick={e => e.stopPropagation()}
                />
                {!isLast && (
                  <textarea
                    value={slide.body || slide.lead || ''}
                    onChange={e => updateSlide(i, slide.body ? 'body' : 'lead', e.target.value)}
                    rows={2}
                    className="w-full text-[11px] text-muted bg-transparent outline-none resize-none"
                    onClick={e => e.stopPropagation()}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* CENTER — Visual preview */}
        <div className="overflow-y-auto flex flex-col items-center py-6 px-5 gap-4 bg-bg">
          <CarouselPreview
            slides={slides}
            preset={carousel.preset}
            illustrationUrls={carousel.illustration_urls as Record<number, string> | null}
            style={carousel.style}
            onSlideChange={setCurrentSlide}
          />

          {/* Illustration controls */}
          <div className="flex flex-col items-center gap-2 w-full max-w-[420px]">
            <div className="w-full bg-bg-surface border border-border rounded-lg p-3">
              <div className="text-[10px] font-semibold tracking-widest uppercase text-muted mb-2">Иллюстрации</div>
              <textarea
                value={illustPrompt}
                onChange={e => setIllustPrompt(e.target.value)}
                placeholder={carousel.illustration_prompt || 'Промпт для иллюстраций (English)'}
                rows={2}
                className="w-full bg-bg rounded-md border border-border px-2.5 py-1.5 text-xs outline-none focus:border-accent resize-none mb-2"
              />
              <button
                onClick={handleIllustrate}
                disabled={isIllustrating}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border text-xs font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-40 transition-colors"
              >
                {isIllustrating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
                {isIllustrating ? 'Генерирую...' : carousel.illustration_urls ? 'Перегенерировать' : 'Сгенерировать иллюстрации'}
              </button>
            </div>
          </div>

          {error && <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg p-2 max-w-[420px]">{error}</div>}
        </div>

        {/* RIGHT — Caption, export */}
        <div className="bg-bg-surface border-l border-border flex flex-col overflow-hidden">
          <div className="flex border-b border-border shrink-0">
            {(['slides', 'caption', 'export'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-[11px] font-semibold text-center border-b-2 transition-colors ${
                  activeTab === tab ? 'text-accent border-accent' : 'text-muted border-transparent'
                }`}
              >
                {tab === 'slides' ? 'Детали' : tab === 'caption' ? 'Подпись' : 'Экспорт'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* Slide details */}
            {activeTab === 'slides' && slides[currentSlide] && (
              <div className="space-y-3">
                <div className="text-[10px] font-semibold tracking-widest uppercase text-muted">
                  {currentSlide === 0 ? 'Обложка' : currentSlide === slides.length - 1 ? 'CTA' : `Слайд ${currentSlide}`}
                </div>
                {Object.entries(slides[currentSlide])
                  .filter(([k, v]) => v && k !== 'illustrationPrompt')
                  .map(([key, val]) => (
                    <div key={key}>
                      <label className="text-[10px] font-semibold text-muted mb-0.5 block uppercase">{key}</label>
                      <textarea
                        value={val as string}
                        onChange={e => updateSlide(currentSlide, key as keyof CarouselSlide, e.target.value)}
                        rows={key === 'title' ? 1 : 2}
                        className="w-full bg-bg rounded-md border border-border px-2.5 py-1.5 text-xs outline-none focus:border-accent resize-none"
                      />
                    </div>
                  ))}
              </div>
            )}

            {/* Caption */}
            {activeTab === 'caption' && (
              <div className="space-y-3">
                <div className="bg-bg rounded-lg border border-border p-3">
                  <div className="text-[10px] font-bold tracking-widest uppercase text-muted mb-2">Подпись</div>
                  <div className="text-xs leading-relaxed text-muted whitespace-pre-wrap min-h-[80px]">
                    {carousel.caption || '—'}
                  </div>
                </div>
                <CopyBtn text={carousel.caption ?? ''} label="Скопировать подпись" copied={copied} copyKey="caption" onCopy={copyToClipboard} />

                <div className="bg-bg rounded-lg border border-border p-3">
                  <div className="text-[10px] font-bold tracking-widest uppercase text-muted mb-2">Хэштеги</div>
                  <div className="text-xs text-muted whitespace-pre-wrap">{carousel.hashtags || '—'}</div>
                </div>
                <CopyBtn text={carousel.hashtags ?? ''} label="Скопировать хэштеги" copied={copied} copyKey="hashtags" onCopy={copyToClipboard} />
              </div>
            )}

            {/* Export */}
            {activeTab === 'export' && (
              <div className="space-y-3">
                <div className="bg-bg rounded-lg border border-border p-3 text-center">
                  <div className="text-xs font-bold">Instagram / TikTok</div>
                  <div className="text-[10px] text-muted">1080 x 1350 px</div>
                </div>

                <button
                  onClick={handleExport}
                  disabled={isExporting || slides.length === 0}
                  className="w-full py-2.5 rounded-lg bg-accent text-white font-bold text-[11px] flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40"
                >
                  {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {isExporting ? 'Экспортирую...' : 'Скачать PNG'}
                </button>

                {carousel.export_urls && carousel.export_urls.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold tracking-widest uppercase text-muted mb-2">Экспортированные</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {carousel.export_urls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                          <img src={url} alt={`Slide ${i + 1}`} className="w-full rounded border border-border" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CopyBtn({ text, label, copied, copyKey, onCopy }: {
  text: string; label: string; copied: string | null; copyKey: string;
  onCopy: (text: string, key: string) => void
}) {
  return (
    <button
      onClick={() => onCopy(text, copyKey)}
      disabled={!text}
      className={`w-full py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
        copied === copyKey ? 'border-green-500 text-green-600 bg-green-50 dark:bg-green-950/30' : 'border-border text-muted hover:border-gray-400'
      }`}
    >
      {copied === copyKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied === copyKey ? 'Скопировано' : label}
    </button>
  )
}
