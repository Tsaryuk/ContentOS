'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import {
  ArrowLeft, ArrowRight, Play, FileText, Sparkles, Loader2,
  Plus, Trash2, Check, RefreshCw
} from 'lucide-react'
import { BRAND_PRESETS } from '@/lib/carousel/types'
import type { CarouselSlide, VoiceStyle } from '@/lib/carousel/types'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
)

type Step = 'source' | 'style' | 'preview'

interface VideoItem {
  id: string
  current_title: string
  generated_title: string | null
  transcript: string | null
  published_at: string | null
  duration_seconds: number | null
}

export default function NewCarouselWizard() {
  const router = useRouter()

  // Step
  const [step, setStep] = useState<Step>('source')

  // Step 1 — Source
  const [sourceType, setSourceType] = useState<'video' | 'text' | null>(null)
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [sourceText, setSourceText] = useState('')
  const [topic, setTopic] = useState('')

  // Step 2 — Style
  const [preset, setPreset] = useState('tsaryuk')
  const [tone, setTone] = useState('Экспертный')
  const [audience, setAudience] = useState('')
  const [slideCount, setSlideCount] = useState(10)
  const [voices, setVoices] = useState<VoiceStyle[]>([])
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null)
  const [examples, setExamples] = useState<string[]>([''])
  const [isTraining, setIsTraining] = useState(false)
  const [voiceName, setVoiceName] = useState('')

  // Step 3 — Preview
  const [isGenerating, setIsGenerating] = useState(false)
  const [slides, setSlides] = useState<CarouselSlide[]>([])
  const [caption, setCaption] = useState('')
  const [hashtags, setHashtags] = useState('')
  const [carouselId, setCarouselId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Load videos with transcripts
  useEffect(() => {
    supabase
      .from('yt_videos')
      .select('id, current_title, generated_title, transcript, published_at, duration_seconds')
      .not('transcript', 'is', null)
      .order('published_at', { ascending: false })
      .limit(20)
      .then(({ data }) => setVideos(data ?? []))
  }, [])

  // Load voice styles
  useEffect(() => {
    fetch('/api/carousel/train-voice')
      .then(r => r.json())
      .then(data => setVoices(data.voices ?? []))
      .catch(() => {})
  }, [])

  const canGoToStyle = sourceType === 'text'
    ? sourceText.trim().length > 20 && topic.trim().length > 0
    : selectedVideoId !== null

  const handleSelectVideo = (v: VideoItem) => {
    setSelectedVideoId(v.id)
    setTopic(v.generated_title || v.current_title || '')
    setSourceType('video')
  }

  const handleTrainVoice = useCallback(async () => {
    const filtered = examples.filter(e => e.trim().length > 20)
    if (filtered.length < 2) return
    setIsTraining(true)
    setError(null)

    try {
      const res = await fetch('/api/carousel/train-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ examples: filtered, name: voiceName || 'Мой стиль' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setVoices(prev => [data.voice, ...prev])
      setSelectedVoiceId(data.voice.id)
      setExamples([''])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setIsTraining(false)
    }
  }, [examples, voiceName])

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true)
    setError(null)

    try {
      const res = await fetch('/api/carousel/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          audience,
          tone,
          slideCount,
          preset,
          videoId: selectedVideoId || undefined,
          voiceId: selectedVoiceId || undefined,
          sourceText: sourceType === 'text' ? sourceText : undefined,
          carouselId: carouselId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSlides(data.slides)
      setCaption(data.caption)
      setHashtags(data.hashtags)
      setCarouselId(data.id)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setIsGenerating(false)
    }
  }, [topic, audience, tone, slideCount, preset, selectedVideoId, selectedVoiceId, sourceText, sourceType, carouselId])

  const handleGoToEditor = () => {
    if (carouselId) router.push(`/carousels/${carouselId}`)
  }

  const tones = ['Экспертный', 'Мотивирующий', 'Провокационный', 'Минималистичный', 'Storytelling']
  const steps: { key: Step; label: string }[] = [
    { key: 'source', label: 'Контент' },
    { key: 'style', label: 'Стиль' },
    { key: 'preview', label: 'Превью' },
  ]

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="h-12 bg-bg-card border-b border-border flex items-center px-4 gap-3">
        <button onClick={() => router.push('/carousels')} className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-semibold">Новая карусель</span>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center gap-1 py-4">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1">
            <button
              onClick={() => {
                if (s.key === 'source') setStep('source')
                if (s.key === 'style' && canGoToStyle) setStep('style')
                if (s.key === 'preview' && canGoToStyle) setStep('preview')
              }}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-colors ${
                step === s.key ? 'bg-accent text-white' : 'bg-bg-card text-muted-foreground border border-border'
              }`}
            >
              {i + 1}. {s.label}
            </button>
            {i < steps.length - 1 && <div className="w-6 h-px bg-border" />}
          </div>
        ))}
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-8">
        {/* ═══ STEP 1 — SOURCE ═══ */}
        {step === 'source' && (
          <div className="space-y-4">
            <h2 className="text-base font-bold">Откуда берём контент?</h2>

            {/* Source type cards */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setSourceType('video')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  sourceType === 'video' ? 'border-accent bg-accent/5' : 'border-border hover:border-gray-400'
                }`}
              >
                <Play className="w-5 h-5 mb-2 text-accent" />
                <div className="text-sm font-bold mb-1">Из видео</div>
                <div className="text-[11px] text-muted-foreground">Выбери видео из ContentOS с готовым транскриптом</div>
              </button>
              <button
                onClick={() => setSourceType('text')}
                className={`p-4 rounded-xl border text-left transition-all ${
                  sourceType === 'text' ? 'border-accent bg-accent/5' : 'border-border hover:border-gray-400'
                }`}
              >
                <FileText className="w-5 h-5 mb-2 text-accent" />
                <div className="text-sm font-bold mb-1">Из текста</div>
                <div className="text-[11px] text-muted-foreground">Вставь текст статьи, заметки или транскрипт</div>
              </button>
            </div>

            {/* Video picker */}
            {sourceType === 'video' && (
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-muted-foreground">Выбери видео</label>
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {videos.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-4 text-center">Нет видео с транскриптами</div>
                  ) : (
                    videos.map(v => (
                      <button
                        key={v.id}
                        onClick={() => handleSelectVideo(v)}
                        className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                          selectedVideoId === v.id ? 'border-accent bg-accent/5' : 'border-border hover:border-gray-400'
                        }`}
                      >
                        <Play className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold truncate">{v.generated_title || v.current_title}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {v.transcript ? `${(v.transcript.length / 1000).toFixed(0)}K символов` : 'Нет транскрипта'}
                          </div>
                        </div>
                        {selectedVideoId === v.id && <Check className="w-4 h-4 text-accent shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Text input */}
            {sourceType === 'text' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Тема карусели</label>
                  <input
                    value={topic}
                    onChange={e => setTopic(e.target.value)}
                    placeholder="Например: 5 ошибок в переговорах о зарплате"
                    className="w-full bg-bg-card rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Исходный текст</label>
                  <textarea
                    value={sourceText}
                    onChange={e => setSourceText(e.target.value)}
                    rows={8}
                    placeholder="Вставь текст статьи, заметки, конспект подкаста..."
                    className="w-full bg-bg-card rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent resize-none"
                  />
                  <div className="text-[10px] text-muted-foreground mt-1">{sourceText.length} символов</div>
                </div>
              </div>
            )}

            {/* Topic for video source */}
            {sourceType === 'video' && selectedVideoId && (
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Тема карусели</label>
                <input
                  value={topic}
                  onChange={e => setTopic(e.target.value)}
                  className="w-full bg-bg-card rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
            )}

            <button
              onClick={() => setStep('style')}
              disabled={!canGoToStyle}
              className="w-full py-3 rounded-lg bg-accent text-white font-bold text-xs flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-30 transition-all"
            >
              Далее — Стиль <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ═══ STEP 2 — STYLE ═══ */}
        {step === 'style' && (
          <div className="space-y-5">
            <h2 className="text-base font-bold">Настрой стиль</h2>

            {/* Brand preset */}
            <div>
              <div className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">Визуальный бренд</div>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(BRAND_PRESETS).map(([key, p]) => (
                  <button
                    key={key}
                    onClick={() => setPreset(key)}
                    className={`border rounded-lg p-2.5 text-left transition-colors ${
                      preset === key ? 'border-accent bg-accent/5' : 'border-border hover:border-gray-400'
                    }`}
                  >
                    <div className="text-[11px] font-bold">{p.name}</div>
                    <div className="flex gap-1 mt-1.5">
                      <div className="w-4 h-4 rounded" style={{ background: p.ink, border: '1px solid rgba(0,0,0,0.08)' }} />
                      <div className="w-4 h-4 rounded" style={{ background: p.light, border: '1px solid rgba(0,0,0,0.08)' }} />
                      <div className="w-4 h-4 rounded" style={{ background: p.accent, border: '1px solid rgba(0,0,0,0.08)' }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Tone + audience */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Тон</label>
                <div className="flex flex-wrap gap-1">
                  {tones.map(t => (
                    <button
                      key={t}
                      onClick={() => setTone(t)}
                      className={`px-2 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
                        tone === t ? 'border-accent bg-accent text-white' : 'border-border text-muted-foreground'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Аудитория</label>
                <input
                  value={audience}
                  onChange={e => setAudience(e.target.value)}
                  placeholder="Предприниматели 25-40"
                  className="w-full bg-bg-card rounded-lg border border-border px-3 py-2 text-xs outline-none focus:border-accent"
                />
              </div>
            </div>

            {/* Slide count */}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Количество слайдов</label>
              <div className="flex items-center gap-2">
                <button onClick={() => setSlideCount(Math.max(3, slideCount - 1))} className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-sm hover:border-gray-400">-</button>
                <span className="text-base font-bold min-w-[28px] text-center">{slideCount}</span>
                <button onClick={() => setSlideCount(Math.min(15, slideCount + 1))} className="w-7 h-7 rounded-md border border-border flex items-center justify-center text-sm hover:border-gray-400">+</button>
              </div>
            </div>

            {/* Voice style */}
            <div className="border-t border-border pt-4">
              <div className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">Голос бренда (текстовый стиль)</div>

              {/* Existing voices */}
              {voices.length > 0 && (
                <div className="space-y-1.5 mb-3">
                  <button
                    onClick={() => setSelectedVoiceId(null)}
                    className={`w-full p-2.5 rounded-lg border text-left text-xs transition-colors ${
                      !selectedVoiceId ? 'border-accent bg-accent/5' : 'border-border hover:border-gray-400'
                    }`}
                  >
                    <span className="font-semibold">Стандартный</span>
                    <span className="text-muted-foreground ml-2">Экспертный, нейтральный тон</span>
                  </button>
                  {voices.map(v => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVoiceId(v.id)}
                      className={`w-full p-2.5 rounded-lg border text-left text-xs transition-colors ${
                        selectedVoiceId === v.id ? 'border-accent bg-accent/5' : 'border-border hover:border-gray-400'
                      }`}
                    >
                      <span className="font-semibold">{v.name}</span>
                      {v.summary && <span className="text-muted-foreground ml-2">{v.summary}</span>}
                    </button>
                  ))}
                </div>
              )}

              {/* Train new voice */}
              <details className="group">
                <summary className="cursor-pointer text-xs font-semibold text-accent flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Обучить новый стиль
                </summary>
                <div className="mt-3 space-y-2">
                  <div className="text-[11px] text-muted-foreground">Добавь 2-5 примеров своих лучших текстов. ИИ проанализирует стиль и будет писать в том же тоне.</div>
                  <input
                    value={voiceName}
                    onChange={e => setVoiceName(e.target.value)}
                    placeholder="Название стиля (напр: Мой Instagram)"
                    className="w-full bg-bg-card rounded-lg border border-border px-3 py-2 text-xs outline-none focus:border-accent"
                  />
                  {examples.map((ex, i) => (
                    <div key={i} className="flex gap-2">
                      <textarea
                        value={ex}
                        onChange={e => {
                          const next = [...examples]
                          next[i] = e.target.value
                          setExamples(next)
                        }}
                        rows={3}
                        placeholder={`Пример текста ${i + 1}...`}
                        className="flex-1 bg-bg-card rounded-lg border border-border px-3 py-2 text-xs outline-none focus:border-accent resize-none"
                      />
                      {examples.length > 1 && (
                        <button onClick={() => setExamples(examples.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <div className="flex gap-2">
                    {examples.length < 5 && (
                      <button onClick={() => setExamples([...examples, ''])} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-accent">
                        <Plus className="w-3 h-3" /> Добавить пример
                      </button>
                    )}
                  </div>
                  <button
                    onClick={handleTrainVoice}
                    disabled={isTraining || examples.filter(e => e.trim().length > 20).length < 2}
                    className="w-full py-2 rounded-lg bg-accent/10 text-accent font-semibold text-xs flex items-center justify-center gap-2 disabled:opacity-30"
                  >
                    {isTraining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {isTraining ? 'Анализирую...' : 'Обучить стиль'}
                  </button>
                </div>
              </details>
            </div>

            {error && <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg p-2">{error}</div>}

            <div className="flex gap-2">
              <button onClick={() => setStep('source')} className="flex-1 py-3 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:border-gray-400">
                <ArrowLeft className="w-3.5 h-3.5 inline mr-1" /> Назад
              </button>
              <button
                onClick={() => { setStep('preview'); handleGenerate() }}
                className="flex-[2] py-3 rounded-lg bg-accent text-white font-bold text-xs flex items-center justify-center gap-2 hover:opacity-90"
              >
                Сгенерировать <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ═══ STEP 3 — PREVIEW ═══ */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Превью слайдов</h2>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:border-accent hover:text-accent disabled:opacity-30"
              >
                {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                Перегенерировать
              </button>
            </div>

            {isGenerating && (
              <div className="flex flex-col items-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-accent" />
                <div className="text-sm font-semibold">Генерирую карусель...</div>
                <div className="text-xs text-muted-foreground">Claude создаёт слайды, подпись и хэштеги</div>
              </div>
            )}

            {error && <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg p-2">{error}</div>}

            {!isGenerating && slides.length > 0 && (
              <>
                <div className="space-y-2">
                  {slides.map((slide, i) => {
                    const isFirst = i === 0
                    const isLast = i === slides.length - 1
                    const label = isFirst ? 'Обложка' : isLast ? 'CTA' : `Слайд ${i}`

                    return (
                      <div key={i} className="bg-bg-card border border-border rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground">{label}</span>
                          {slide.tag && <span className="text-[10px] text-accent font-semibold">{slide.tag}</span>}
                        </div>
                        <div className="text-sm font-bold mb-1">{slide.title}</div>
                        {slide.subtitle && <div className="text-xs text-muted-foreground mb-1">{slide.subtitle}</div>}
                        {slide.lead && <div className="text-xs text-muted-foreground mb-1">{slide.lead}</div>}
                        {slide.bold && <div className="text-xs font-bold mb-1">{slide.bold}</div>}
                        {slide.body && <div className="text-xs text-muted-foreground">{slide.body}</div>}
                        {slide.example && (
                          <div className="mt-2 pt-2 border-t border-border">
                            <span className="text-[10px] font-semibold text-muted-foreground">ПРИМЕР: </span>
                            <span className="text-xs text-muted-foreground italic">{slide.example}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Caption preview */}
                {caption && (
                  <div className="bg-bg-card border border-border rounded-xl p-4">
                    <div className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">Подпись к посту</div>
                    <div className="text-xs text-muted-foreground whitespace-pre-wrap">{caption}</div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setStep('style')} className="flex-1 py-3 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:border-gray-400">
                    <ArrowLeft className="w-3.5 h-3.5 inline mr-1" /> Стиль
                  </button>
                  <button
                    onClick={handleGoToEditor}
                    disabled={!carouselId}
                    className="flex-[2] py-3 rounded-lg bg-accent text-white font-bold text-xs flex items-center justify-center gap-2 hover:opacity-90 disabled:opacity-30"
                  >
                    Открыть редактор <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
