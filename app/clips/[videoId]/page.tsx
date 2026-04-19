'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Scissors, Loader2, Play, Check, X,
  RefreshCw, Zap, Clock, Copy, Film, Video
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
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtDuration(sec: number): string {
  if (sec >= 60) return `${Math.floor(sec / 60)} мин ${Math.floor(sec % 60)} сек`
  return `${Math.floor(sec)} сек`
}

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green bg-green/10'
  if (score >= 60) return 'text-warn bg-warn/10'
  return 'text-muted-foreground/60 bg-card'
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
}

type ContentTab = 'shorts' | 'episodes'

export default function ClipsPage() {
  const params = useParams()
  const router = useRouter()
  const videoId = params.videoId as string

  const [video, setVideo] = useState<any>(null)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [contentTab, setContentTab] = useState<ContentTab>('shorts')
  const [copiedTimestamp, setCopiedTimestamp] = useState<string | null>(null)

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

  const copyTimestamp = (c: Candidate) => {
    const text = `${fmtTime(c.start_time)} - ${fmtTime(c.end_time)}`
    navigator.clipboard.writeText(text)
    setCopiedTimestamp(c.id)
    setTimeout(() => setCopiedTimestamp(null), 2000)
  }

  const selected = candidates.find(c => c.id === selectedId)

  // Split by type: shorts (<=90s) and mini-episodes (>90s)
  const shorts = candidates.filter(c => (c.end_time - c.start_time) <= 120)
  const episodes = candidates.filter(c => (c.end_time - c.start_time) > 120)
  const activeList = contentTab === 'shorts' ? shorts : episodes
  const approvedCount = candidates.filter(c => c.status === 'approved').length
  const newCount = candidates.filter(c => c.status === 'candidate').length

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div className="h-screen flex flex-col text-foreground">
      {/* Header */}
      <div className="border-b border-border px-6 py-3 flex items-center gap-4 shrink-0">
        <button onClick={() => router.push(`/youtube/${videoId}`)} className="p-1.5 rounded-lg hover:bg-card transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Scissors className="w-4 h-4 text-purple" />
        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-medium truncate">{video?.current_title ?? 'Клипы'}</h1>
          <span className="text-[10px] text-muted-foreground/60">
            {candidates.length > 0
              ? `${candidates.length} идей — ${approvedCount} одобрено, ${newCount} новых`
              : 'Нет кандидатов'}
          </span>
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
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple/10 text-purple text-xs">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI анализирует видео...
          </div>
        )}
        {candidates.length > 0 && (
          <button
            onClick={() => { setCandidates([]); startAnalysis() }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="w-3 h-3" /> Переанализировать
          </button>
        )}
      </div>

      {/* No candidates state */}
      {candidates.length === 0 && !analyzing && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Scissors className="w-10 h-10 text-muted-foreground/60 mx-auto mb-4" />
            <p className="text-muted-foreground text-sm mb-2">Нет идей для клипов</p>
            <p className="text-muted-foreground/60 text-xs mb-4">AI проанализирует транскрипт и найдёт лучшие моменты</p>
            {!video?.transcript && (
              <p className="text-xs text-warn">Сначала запустите транскрипцию видео</p>
            )}
          </div>
        </div>
      )}

      {/* Two-panel layout */}
      {candidates.length > 0 && (
        <div className="flex-1 flex overflow-hidden">
          {/* Left: candidate list */}
          <div className="w-[420px] border-r border-border flex flex-col shrink-0">
            {/* Content type tabs */}
            <div className="flex gap-1 p-2 border-b border-border">
              <button
                onClick={() => setContentTab('shorts')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  contentTab === 'shorts' ? 'bg-card text-foreground border border-border' : 'text-muted-foreground/60 hover:text-muted-foreground'
                }`}
              >
                <Film className="w-3 h-3" /> Shorts ({shorts.length})
              </button>
              <button
                onClick={() => setContentTab('episodes')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  contentTab === 'episodes' ? 'bg-card text-foreground border border-border' : 'text-muted-foreground/60 hover:text-muted-foreground'
                }`}
              >
                <Video className="w-3 h-3" /> Ролики ({episodes.length})
              </button>
            </div>

            {/* Candidate cards */}
            <div className="flex-1 overflow-y-auto">
              {activeList.length === 0 && (
                <div className="text-center py-12 text-muted-foreground/60 text-xs">
                  Нет {contentTab === 'shorts' ? 'шортсов' : 'роликов'} для этого видео
                </div>
              )}
              {activeList.map(c => {
                const vp = c.scores?.virality_potential ?? 0
                const pattern = PATTERN_LABELS[c.pattern_type] ?? { label: c.pattern_type, color: 'text-muted-foreground bg-card' }
                const isSelected = selectedId === c.id
                const dur = c.end_time - c.start_time

                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`p-3 border-b border-border cursor-pointer transition-colors ${
                      isSelected ? 'bg-purple/5 border-l-2 border-l-purple' : 'hover:bg-card'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${scoreColor(vp)}`}>{vp}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${pattern.color}`}>{pattern.label}</span>
                      <span className="text-[10px] text-muted-foreground/60 ml-auto flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />{fmtDuration(dur)}
                      </span>
                    </div>
                    <p className="text-xs text-foreground font-medium line-clamp-2 mb-1">{c.hook_phrase}</p>
                    <p className="text-[10px] text-muted-foreground/60 line-clamp-1">{c.one_sentence_value}</p>

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
                            className="px-2 py-1 rounded text-[10px] bg-card text-muted-foreground/60 hover:text-red-400 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      )}
                      {c.status === 'approved' && (
                        <span className="text-[10px] text-green flex items-center gap-1">
                          <Check className="w-3 h-3" /> Одобрено
                        </span>
                      )}
                      {c.status === 'rejected' && (
                        <span className="text-[10px] text-muted-foreground/60">Отклонено</span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); copyTimestamp(c) }}
                        className="ml-auto px-2 py-1 rounded text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
                        title="Копировать таймкод"
                      >
                        {copiedTimestamp === c.id
                          ? <Check className="w-3 h-3 text-green" />
                          : <Copy className="w-3 h-3" />}
                      </button>
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
                  {/* Timestamp */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="font-mono">{fmtTime(selected.start_time)} — {fmtTime(selected.end_time)}</span>
                    <span className="text-muted-foreground/60">({fmtDuration(selected.end_time - selected.start_time)})</span>
                    <button
                      onClick={() => copyTimestamp(selected)}
                      className="ml-auto text-muted-foreground/60 hover:text-foreground transition-colors"
                    >
                      {copiedTimestamp === selected.id ? <Check className="w-3.5 h-3.5 text-green" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Titles */}
                  <div>
                    <h3 className="text-sm font-medium mb-2">Заголовки</h3>
                    <div className="space-y-1.5">
                      {selected.suggested_titles.map((t, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-foreground bg-card border border-border px-3 py-1.5 rounded-lg flex-1">{t}</span>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(t)
                              updateCandidate(selected.id, { approved_title: t })
                            }}
                            className={`px-2 py-1 rounded text-[10px] transition-colors ${
                              selected.approved_title === t
                                ? 'bg-green/20 text-green'
                                : 'bg-card text-muted-foreground/60 hover:text-foreground border border-border'
                            }`}
                          >
                            {selected.approved_title === t ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Thumbnail text */}
                  <div>
                    <h3 className="text-sm font-medium mb-2">Текст для обложки</h3>
                    <div className="flex flex-wrap gap-2">
                      {selected.suggested_thumbnail_text.map((t, i) => (
                        <button
                          key={i}
                          onClick={() => navigator.clipboard.writeText(t)}
                          className="text-xs bg-card border border-border px-3 py-1.5 rounded-lg hover:border-muted/30 transition-colors"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quote */}
                  <div>
                    <h3 className="text-sm font-medium mb-2">Цитата</h3>
                    <p className="text-xs text-muted-foreground bg-card border border-border rounded-lg p-3 leading-relaxed">
                      {selected.transcript_excerpt}
                    </p>
                  </div>

                  {/* Context */}
                  <div>
                    <h3 className="text-sm font-medium mb-2">Почему этот момент</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{selected.context_notes}</p>
                  </div>

                  {/* Scores */}
                  <div>
                    <h3 className="text-sm font-medium mb-2">Скоринг</h3>
                    <div className="grid grid-cols-5 gap-2">
                      {Object.entries(selected.scores).map(([key, val]) => (
                        <div key={key} className="text-center bg-card border border-border rounded-lg p-2">
                          <div className={`text-lg font-bold ${scoreColor(val as number)?.split(' ')[0]}`}>{val as number}</div>
                          <div className="text-[9px] text-muted-foreground/60 mt-0.5">
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
                <div className="text-center text-muted-foreground/60">
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
