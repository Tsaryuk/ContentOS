'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Scissors, Loader2, Play, Check, X,
  Download, RefreshCw, Zap, Clock, ThumbsUp, AlertCircle
} from 'lucide-react'

const PATTERN_LABELS: Record<string, { label: string; color: string }> = {
  counter_intuitive: { label: 'Контринтуитивное', color: 'text-purple-400 bg-purple-500/10' },
  shock_statistic: { label: 'Шок-факт', color: 'text-orange-400 bg-orange-500/10' },
  personal_revelation: { label: 'Откровение', color: 'text-pink-400 bg-pink-500/10' },
  conflict_disagreement: { label: 'Конфликт', color: 'text-red-400 bg-red-500/10' },
  practical_protocol: { label: 'Совет', color: 'text-teal-400 bg-teal-500/10' },
  emotional_peak: { label: 'Эмоция', color: 'text-rose-400 bg-rose-500/10' },
  humor_unexpected: { label: 'Юмор', color: 'text-yellow-400 bg-yellow-500/10' },
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green bg-green/10'
  if (score >= 60) return 'text-warn bg-warn/10'
  return 'text-dim bg-surface'
}

interface Candidate {
  id: string
  start_time: number
  end_time: number
  duration: number
  clip_type: string
  pattern_type: string
  scores: { hook: number; emotional_peak: number; information_density: number; standalone_value: number; virality_potential: number }
  hook_phrase: string
  one_sentence_value: string
  suggested_titles: string[]
  suggested_thumbnail_text: string[]
  transcript_excerpt: string
  context_notes: string
  status: string
  approved_title: string | null
  output_url: string | null
  error_message: string | null
}

export default function ClipsPage() {
  const params = useParams()
  const router = useRouter()
  const videoId = params.videoId as string

  const [video, setVideo] = useState<any>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'candidate' | 'approved' | 'done'>('all')
  const [processing, setProcessing] = useState<Set<string>>(new Set())

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  const loadData = useCallback(async () => {
    const [videoRes, candidatesRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/yt_videos?id=eq.${videoId}&select=id,yt_video_id,current_title,duration_seconds,transcript`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      }),
      fetch(`/api/clips/candidates?videoId=${videoId}`),
    ])
    const vData = await videoRes.json()
    if (vData?.[0]) setVideo(vData[0])
    const cData = await candidatesRes.json()
    setCandidates(cData.candidates ?? [])
    setLoading(false)
  }, [videoId, SUPABASE_URL, SUPABASE_KEY])

  useEffect(() => { loadData() }, [loadData])

  // Poll while analyzing
  useEffect(() => {
    if (!analyzing) return
    const interval = setInterval(async () => {
      const res = await fetch(`/api/clips/candidates?videoId=${videoId}`)
      const data = await res.json()
      if (data.candidates?.length > 0) {
        setCandidates(data.candidates)
        setAnalyzing(false)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [analyzing, videoId])

  const startAnalysis = async () => {
    setAnalyzing(true)
    await fetch('/api/clips/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId }),
    })
  }

  const updateCandidate = async (id: string, updates: Record<string, any>) => {
    await fetch('/api/clips/candidates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    setCandidates(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
  }

  const processClip = async (id: string) => {
    setProcessing(prev => new Set(prev).add(id))
    await fetch('/api/clips/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: id }),
    })
    // Poll for completion
    const poll = setInterval(async () => {
      const res = await fetch(`/api/clips/candidates?videoId=${videoId}`)
      const data = await res.json()
      const updated = data.candidates?.find((c: any) => c.id === id)
      if (updated && (updated.status === 'done' || updated.status === 'failed')) {
        setCandidates(data.candidates)
        setProcessing(prev => { const n = new Set(prev); n.delete(id); return n })
        clearInterval(poll)
      }
    }, 5000)
  }

  const selected = candidates.find(c => c.id === selectedId)
  const filtered = filter === 'all' ? candidates : candidates.filter(c => c.status === filter)
  const counts = {
    all: candidates.length,
    candidate: candidates.filter(c => c.status === 'candidate').length,
    approved: candidates.filter(c => c.status === 'approved').length,
    done: candidates.filter(c => c.status === 'done').length,
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-5 h-5 animate-spin text-muted" />
    </div>
  )

  return (
    <div className="h-screen flex flex-col text-cream">
      {/* Header */}
      <div className="border-b border-border px-6 py-3 flex items-center gap-4 shrink-0">
        <button onClick={() => router.push(`/youtube/${videoId}`)} className="p-1.5 rounded-lg hover:bg-surface transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Scissors className="w-4 h-4 text-purple" />
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-medium truncate">{video?.current_title ?? 'Клипы'}</h1>
          <span className="text-[10px] text-dim">{candidates.length} кандидатов</span>
        </div>
        {candidates.length === 0 && !analyzing && (
          <button
            onClick={startAnalysis}
            disabled={!video?.transcript}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple text-white text-xs font-medium hover:opacity-90 disabled:opacity-30"
          >
            <Zap className="w-3.5 h-3.5" /> Найти клип-моменты
          </button>
        )}
        {analyzing && (
          <div className="flex items-center gap-2 text-xs text-purple">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI анализирует...
          </div>
        )}
        {candidates.length > 0 && (
          <button
            onClick={() => { setCandidates([]); startAnalysis() }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted hover:text-cream transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Переанализировать
          </button>
        )}
      </div>

      {/* No candidates state */}
      {candidates.length === 0 && !analyzing && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Scissors className="w-10 h-10 text-dim mx-auto mb-4" />
            <p className="text-muted text-sm mb-2">Нет клип-кандидатов</p>
            <p className="text-dim text-xs">Нажмите "Найти клип-моменты" чтобы AI проанализировал видео</p>
          </div>
        </div>
      )}

      {/* Two-panel layout */}
      {candidates.length > 0 && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: candidate list */}
          <div className="w-[420px] border-r border-border flex flex-col shrink-0">
            {/* Filter tabs */}
            <div className="flex gap-1 p-2 border-b border-border">
              {(['all', 'candidate', 'approved', 'done'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded text-[10px] font-medium transition-colors ${
                    filter === f ? 'bg-surface text-cream border border-border' : 'text-dim hover:text-muted'
                  }`}
                >
                  {f === 'all' ? 'Все' : f === 'candidate' ? 'Новые' : f === 'approved' ? 'Одобрено' : 'Готово'} ({counts[f]})
                </button>
              ))}
            </div>

            {/* Candidate cards */}
            <div className="flex-1 overflow-y-auto">
              {filtered.map(c => {
                const vp = c.scores?.virality_potential ?? 0
                const pattern = PATTERN_LABELS[c.pattern_type] ?? { label: c.pattern_type, color: 'text-muted bg-surface' }
                const isSelected = selectedId === c.id

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`p-3 border-b border-border cursor-pointer transition-colors ${
                      isSelected ? 'bg-purple/5 border-l-2 border-l-purple' : 'hover:bg-surface'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${scoreColor(vp)}`}>{vp}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${pattern.color}`}>{pattern.label}</span>
                      <span className="text-[10px] text-dim ml-auto flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />{fmtTime(c.start_time)} – {fmtTime(c.end_time)}
                      </span>
                    </div>
                    <p className="text-xs text-cream font-medium line-clamp-2 mb-1">{c.hook_phrase}</p>
                    <p className="text-[10px] text-dim line-clamp-1">{c.one_sentence_value}</p>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 mt-2">
                      {c.status === 'candidate' && (
                        <>
                          <button
                            onClick={e => { e.stopPropagation(); updateCandidate(c.id, { status: 'approved' }) }}
                            className="px-2 py-1 rounded text-[10px] bg-green/10 text-green hover:bg-green/20 transition-colors"
                          >
                            <Check className="w-3 h-3 inline mr-1" />Одобрить
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); updateCandidate(c.id, { status: 'rejected' }) }}
                            className="px-2 py-1 rounded text-[10px] bg-surface text-dim hover:text-red-400 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      )}
                      {c.status === 'approved' && (
                        <button
                          onClick={e => { e.stopPropagation(); processClip(c.id) }}
                          disabled={processing.has(c.id)}
                          className="px-2 py-1 rounded text-[10px] bg-purple/10 text-purple hover:bg-purple/20 transition-colors disabled:opacity-50"
                        >
                          {processing.has(c.id) ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : <Scissors className="w-3 h-3 inline mr-1" />}
                          Нарезать
                        </button>
                      )}
                      {c.status === 'processing' && (
                        <span className="text-[10px] text-purple flex items-center gap-1">
                          <Loader2 className="w-3 h-3 animate-spin" /> Обработка...
                        </span>
                      )}
                      {c.status === 'done' && c.output_url && (
                        <a
                          href={c.output_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="px-2 py-1 rounded text-[10px] bg-green/10 text-green hover:bg-green/20 transition-colors"
                        >
                          <Download className="w-3 h-3 inline mr-1" />Скачать
                        </a>
                      )}
                      {c.status === 'failed' && (
                        <span className="text-[10px] text-red-400 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Ошибка
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right: player + details */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selected ? (
              <>
                {/* Video player */}
                <div className="aspect-video bg-black shrink-0">
                  <iframe
                    src={`https://www.youtube.com/embed/${video?.yt_video_id}?start=${Math.floor(selected.start_time)}&end=${Math.ceil(selected.end_time)}&autoplay=0`}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>

                {/* Details */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Заголовки</h3>
                    <div className="space-y-1.5">
                      {selected.suggested_titles.map((t, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-cream bg-surface border border-border px-3 py-1.5 rounded-lg flex-1">{t}</span>
                          <button
                            onClick={() => updateCandidate(selected.id, { approved_title: t })}
                            className={`px-2 py-1 rounded text-[10px] transition-colors ${
                              selected.approved_title === t
                                ? 'bg-green/20 text-green'
                                : 'bg-surface text-dim hover:text-cream'
                            }`}
                          >
                            {selected.approved_title === t ? <Check className="w-3 h-3" /> : 'Выбрать'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium mb-2">Текст для обложки</h3>
                    <div className="flex flex-wrap gap-2">
                      {selected.suggested_thumbnail_text.map((t, i) => (
                        <span key={i} className="text-xs bg-surface border border-border px-3 py-1.5 rounded-lg">{t}</span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium mb-2">Цитата</h3>
                    <p className="text-xs text-muted bg-surface border border-border rounded-lg p-3 leading-relaxed">
                      {selected.transcript_excerpt}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-medium mb-2">Почему этот момент</h3>
                    <p className="text-xs text-muted leading-relaxed">{selected.context_notes}</p>
                  </div>

                  {/* Scores breakdown */}
                  <div>
                    <h3 className="text-sm font-medium mb-2">Скоринг</h3>
                    <div className="grid grid-cols-5 gap-2">
                      {Object.entries(selected.scores).map(([key, val]) => (
                        <div key={key} className="text-center bg-surface border border-border rounded-lg p-2">
                          <div className={`text-lg font-bold ${scoreColor(val as number)?.split(' ')[0]}`}>{val as number}</div>
                          <div className="text-[9px] text-dim mt-0.5">
                            {key === 'hook' ? 'Хук' : key === 'emotional_peak' ? 'Эмоция' : key === 'information_density' ? 'Инфо' : key === 'standalone_value' ? 'Автоном.' : 'Вирусн.'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-dim">
                  <Play className="w-8 h-8 mx-auto mb-3" />
                  <p className="text-xs">Выберите клип слева для предпросмотра</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
