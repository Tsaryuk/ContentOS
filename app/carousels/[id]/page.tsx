'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Copy, Check, Download, Image, Loader2, RefreshCw } from 'lucide-react'
import { CarouselPreview } from '@/components/carousel/CarouselPreview'
import type { CarouselRow, CarouselSlide } from '@/lib/carousel/types'
import { BRAND_PRESETS } from '@/lib/carousel/types'

export default function CarouselEditorPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = params.id as string
  const isNew = id === 'new'

  const [videoId] = useState(() => searchParams.get('videoId') ?? undefined)
  const [carousel, setCarousel] = useState<CarouselRow | null>(null)
  const [topic, setTopic] = useState(() => searchParams.get('topic') ?? '')
  const [audience, setAudience] = useState('')
  const [tone, setTone] = useState('Экспертный')
  const [preset, setPreset] = useState('tsaryuk')
  const [slideCount, setSlideCount] = useState(10)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isIllustrating, setIsIllustrating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [illustPrompt, setIllustPrompt] = useState('')
  const [copied, setCopied] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'caption' | 'slides' | 'export'>('caption')
  const [currentSlide, setCurrentSlide] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Load existing carousel
  useEffect(() => {
    if (isNew) return
    fetch(`/api/carousel/get?id=${id}`)
      .then(r => r.json())
      .then(data => {
        if (data.carousel) {
          const c = data.carousel as CarouselRow
          setCarousel(c)
          setTopic(c.topic)
          setAudience(c.audience ?? '')
          setTone(c.tone)
          setPreset(c.preset)
          setSlideCount(c.slide_count)
        }
      })
      .catch(() => {})
  }, [id, isNew])

  const slides: CarouselSlide[] = carousel?.slides ?? []

  const handleGenerate = useCallback(async () => {
    if (!topic.trim()) return
    setIsGenerating(true)
    setError(null)

    try {
      const res = await fetch('/api/carousel/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, audience, tone, slideCount, preset, videoId }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Generation failed')

      setCarousel({
        id: data.id,
        project_id: null,
        channel_id: null,
        video_id: null,
        topic,
        audience,
        tone,
        preset,
        slide_count: slideCount,
        slides: data.slides,
        caption: data.caption,
        hashtags: data.hashtags,
        illustration_prompt: data.illustrationPrompt,
        illustration_url: null,
        illustration_urls: null,
        style: data.style ?? null,
        export_urls: null,
        export_zip_url: null,
        status: 'ready',
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      if (isNew) {
        window.history.replaceState(null, '', `/carousels/${data.id}`)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsGenerating(false)
    }
  }, [topic, audience, tone, slideCount, preset, isNew])

  const handleIllustrate = useCallback(async () => {
    if (!carousel?.id) return
    setIsIllustrating(true)

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

      if (!res.ok) throw new Error(data.error || 'Illustration failed')
      setCarousel(prev => prev ? {
        ...prev,
        illustration_urls: data.urls,
        illustration_url: data.urls?.[0] ?? prev.illustration_url,
      } : null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsIllustrating(false)
    }
  }, [carousel?.id])

  const handleExport = useCallback(async () => {
    if (!carousel?.id) return
    setIsExporting(true)

    try {
      const res = await fetch('/api/carousel/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carouselId: carousel.id }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Export failed')
      setCarousel(prev => prev ? { ...prev, export_urls: data.urls, status: 'exported' } : null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsExporting(false)
    }
  }, [carousel?.id])

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    await navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }, [])

  const tones = ['Экспертный', 'Мотивирующий', 'Провокационный', 'Минималистичный', 'Storytelling']

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <div className="h-12 bg-bg-surface border-b border-border flex items-center px-4 gap-3 shrink-0">
        <button onClick={() => router.push('/carousels')} className="text-muted hover:text-cream transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-semibold">Карусель</span>
        <span className="text-[10px] text-muted">{carousel?.status === 'ready' ? 'Готово' : carousel?.status === 'exported' ? 'Экспортировано' : 'Черновик'}</span>
      </div>

      {/* 3-panel workspace */}
      <div className="flex-1 grid grid-cols-[300px_1fr_320px] overflow-hidden">

        {/* LEFT PANEL — Controls */}
        <div className="bg-bg-surface border-r border-border overflow-y-auto">
          {/* Topic */}
          <div className="p-4 border-b border-border">
            <div className="text-[9px] font-semibold tracking-widest uppercase text-muted mb-3">Контент</div>

            <label className="block text-[11px] font-semibold text-muted mb-1">Тема карусели</label>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              rows={3}
              placeholder="Например: 5 ошибок в переговорах о зарплате"
              className="w-full bg-bg rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent resize-none"
            />

            <label className="block text-[11px] font-semibold text-muted mb-1 mt-3">Целевая аудитория</label>
            <input
              value={audience}
              onChange={e => setAudience(e.target.value)}
              placeholder="Предприниматели 25-40 лет"
              className="w-full bg-bg rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            />

            <label className="block text-[11px] font-semibold text-muted mb-1 mt-3">Тон</label>
            <div className="flex flex-wrap gap-1.5">
              {tones.map(t => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                    tone === t
                      ? 'border-accent bg-accent text-white'
                      : 'border-border text-muted hover:border-gray-400'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Brand */}
          <div className="p-4 border-b border-border">
            <div className="text-[9px] font-semibold tracking-widest uppercase text-muted mb-3">Бренд</div>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(BRAND_PRESETS).map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => setPreset(key)}
                  className={`border rounded-lg p-2 text-left transition-colors ${
                    preset === key ? 'border-accent bg-accent/5' : 'border-border hover:border-gray-400'
                  }`}
                >
                  <div className="text-[11px] font-bold">{p.name}</div>
                  <div className="text-[10px] text-muted">{p.headFont} + {p.bodyFont}</div>
                  <div className="flex gap-1 mt-1.5">
                    <div className="w-3.5 h-3.5 rounded" style={{ background: p.ink, border: '1px solid rgba(0,0,0,0.08)' }} />
                    <div className="w-3.5 h-3.5 rounded" style={{ background: p.light, border: '1px solid rgba(0,0,0,0.08)' }} />
                    <div className="w-3.5 h-3.5 rounded" style={{ background: p.accent, border: '1px solid rgba(0,0,0,0.08)' }} />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Slides count + generate */}
          <div className="p-4">
            <div className="text-[9px] font-semibold tracking-widest uppercase text-muted mb-3">Слайды</div>
            <div className="flex items-center gap-2 mb-3">
              <button onClick={() => setSlideCount(Math.max(3, slideCount - 1))} className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-sm hover:border-gray-400">-</button>
              <span className="text-lg font-bold min-w-[28px] text-center">{slideCount}</span>
              <button onClick={() => setSlideCount(Math.min(15, slideCount + 1))} className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-sm hover:border-gray-400">+</button>
              <span className="text-[11px] text-muted ml-1">слайдов<br />1080x1350</span>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !topic.trim()}
              className="w-full py-3 rounded-lg bg-accent text-white font-bold text-xs flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 transition-all"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {isGenerating ? 'Генерирую...' : 'Сгенерировать'}
            </button>

            {error && (
              <div className="mt-2 text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg p-2">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* CENTER — Preview */}
        <div className="overflow-y-auto flex flex-col items-center py-6 px-5 gap-4 bg-bg">
          <CarouselPreview
            slides={slides}
            preset={preset}
            illustrationUrls={carousel?.illustration_urls}
            style={carousel?.style}
            onSlideChange={setCurrentSlide}
          />

          {/* Illustration controls */}
          {slides.length > 0 && (
            <div className="flex flex-col items-center gap-2 w-full max-w-[420px]">
              <div className="w-full bg-bg-surface border border-border rounded-lg p-3">
                <div className="text-[10px] font-semibold tracking-widest uppercase text-muted mb-2">Иллюстрация обложки</div>
                <textarea
                  value={illustPrompt}
                  onChange={e => setIllustPrompt(e.target.value)}
                  placeholder={carousel?.illustration_prompt || 'Промпт генерируется автоматически из темы. Можно переписать вручную (English)'}
                  rows={2}
                  className="w-full bg-bg rounded-md border border-border px-2.5 py-1.5 text-xs outline-none focus:border-accent resize-none mb-2"
                />
                <button
                  onClick={handleIllustrate}
                  disabled={isIllustrating}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-border text-xs font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-40 transition-colors"
                >
                  {isIllustrating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Image className="w-3.5 h-3.5" />}
                  {isIllustrating ? 'Генерирую все слайды...' : carousel?.illustration_urls ? 'Перегенерировать иллюстрации' : 'Сгенерировать иллюстрации для всех слайдов'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT PANEL — Results */}
        <div className="bg-bg-surface border-l border-border flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-border shrink-0">
            {(['caption', 'slides', 'export'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-3 text-[11px] font-semibold text-center transition-colors border-b-2 ${
                  activeTab === tab ? 'text-accent border-accent' : 'text-muted border-transparent'
                }`}
              >
                {tab === 'caption' ? 'Подпись' : tab === 'slides' ? 'Слайды' : 'Экспорт'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* Caption tab */}
            {activeTab === 'caption' && (
              <div className="space-y-3">
                <div className="bg-bg rounded-lg border border-border p-3">
                  <div className="text-[10px] font-bold tracking-widest uppercase text-muted mb-2">Подпись к посту</div>
                  <div className="text-sm leading-relaxed text-muted whitespace-pre-wrap min-h-[80px]">
                    {carousel?.caption || 'Сначала сгенерируй карусель'}
                  </div>
                </div>
                <CopyButton text={carousel?.caption ?? ''} label="Скопировать подпись" copied={copied} copyKey="caption" onCopy={copyToClipboard} />

                <div className="bg-bg rounded-lg border border-border p-3">
                  <div className="text-[10px] font-bold tracking-widest uppercase text-muted mb-2">Хэштеги</div>
                  <div className="text-sm leading-relaxed text-muted whitespace-pre-wrap">
                    {carousel?.hashtags || '-'}
                  </div>
                </div>
                <CopyButton text={carousel?.hashtags ?? ''} label="Скопировать хэштеги" copied={copied} copyKey="hashtags" onCopy={copyToClipboard} />
              </div>
            )}

            {/* Slides tab */}
            {activeTab === 'slides' && (
              <div className="space-y-1.5">
                {slides.map((slide, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentSlide(i)}
                    className={`w-full flex items-start gap-2.5 p-2.5 rounded-lg border transition-colors text-left ${
                      currentSlide === i ? 'border-accent bg-accent/5' : 'border-border hover:border-gray-400'
                    }`}
                  >
                    <div
                      className="w-8 h-10 rounded shrink-0 flex items-center justify-center text-[9px] font-bold"
                      style={{
                        background: i === 0 || i === slides.length - 1 ? '#F7F5F0' : i % 2 === 0 ? '#1C1A17' : '#F7F5F0',
                        color: i === 0 || i === slides.length - 1 ? '#1C1A17' : i % 2 === 0 ? '#F7F5F0' : '#1C1A17',
                      }}
                    >
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-xs font-semibold truncate max-w-[200px]">{slide.title}</div>
                      <div className="text-[11px] text-muted line-clamp-1">
                        {i === 0 ? 'Обложка' : i === slides.length - 1 ? 'CTA' : slide.lead || slide.body || ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Export tab */}
            {activeTab === 'export' && (
              <div className="space-y-3">
                <div className="text-[9px] font-semibold tracking-widest uppercase text-muted mb-2">Формат экспорта</div>

                <div className="bg-bg rounded-lg border border-border p-3 text-center">
                  <div className="text-xs font-bold">Instagram / TikTok</div>
                  <div className="text-[10px] text-muted">1080 x 1350 px (4:5)</div>
                </div>

                <button
                  onClick={handleExport}
                  disabled={isExporting || slides.length === 0}
                  className="w-full py-2.5 rounded-lg bg-accent text-white font-bold text-[11px] flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-40 transition-all"
                >
                  {isExporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                  {isExporting ? 'Экспортирую...' : 'Скачать PNG'}
                </button>

                {carousel?.export_urls && carousel.export_urls.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[10px] font-bold tracking-widest uppercase text-muted mb-2">Экспортированные слайды</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {carousel.export_urls.map((url, i) => (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                          <img src={url} alt={`Slide ${i + 1}`} className="w-full rounded border border-border" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !topic.trim()}
                  className="w-full py-2.5 rounded-lg border border-border text-xs font-semibold text-muted flex items-center justify-center gap-2 hover:border-gray-400 disabled:opacity-40 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Перегенерировать
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function CopyButton({ text, label, copied, copyKey, onCopy }: {
  text: string; label: string; copied: string | null; copyKey: string;
  onCopy: (text: string, key: string) => void
}) {
  return (
    <button
      onClick={() => onCopy(text, copyKey)}
      disabled={!text}
      className={`w-full py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
        copied === copyKey
          ? 'border-green-500 text-green-600 bg-green-50 dark:bg-green-950/30'
          : 'border-border text-muted hover:border-gray-400'
      }`}
    >
      {copied === copyKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied === copyKey ? 'Скопировано' : label}
    </button>
  )
}
