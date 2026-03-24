'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
}

const CHANNEL_ID = 'UCSNzUPA6aagf1XD37oXQWsw'

type Video = {
  id: string
  yt_video_id: string
  current_title: string
  current_thumbnail: string
  duration_seconds: number
  published_at: string
  view_count: number
  status: string
  ai_score: number | null
  is_approved: boolean
  generated_title: string | null
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending:      { label: 'Не начато',    color: 'text-muted' },
  transcribing: { label: 'Транскрипция', color: 'text-accent' },
  generating:   { label: 'AI генерация', color: 'text-purple' },
  thumbnail:    { label: 'Обложка',      color: 'text-warn' },
  review:       { label: 'На проверке',  color: 'text-warn' },
  publishing:   { label: 'Публикация',   color: 'text-green' },
  done:         { label: 'Готово',        color: 'text-green' },
  error:        { label: 'Ошибка',        color: 'text-danger' },
}

const STATUS_DOT: Record<string, string> = {
  pending:      'bg-muted',
  transcribing: 'bg-accent',
  generating:   'bg-purple',
  thumbnail:    'bg-warn',
  review:       'bg-warn',
  publishing:   'bg-green',
  done:         'bg-green',
  error:        'bg-danger',
}

function fmtDuration(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

function fmtViews(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K'
  return String(n)
}

export default function YouTubePage() {
  const supabaseRef = useRef<SupabaseClient | null>(null)
  if (!supabaseRef.current && typeof window !== 'undefined') {
    supabaseRef.current = getSupabase()
  }
  const supabase = supabaseRef.current
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [stats, setStats] = useState({ total: 0, done: 0, pending: 0, errors: 0 })

  useEffect(() => { loadVideos() }, [filter])

  async function loadVideos() {
    if (!supabase) return
    setLoading(true)
    let q = supabase
      .from('yt_videos')
      .select('*')
      .order('published_at', { ascending: false })

    if (filter !== 'all') q = q.eq('status', filter)

    const { data } = await q
    setVideos(data || [])

    const { data: all } = await supabase.from('yt_videos').select('status')
    if (all) {
      setStats({
        total:   all.length,
        done:    all.filter(v => v.status === 'done').length,
        pending: all.filter(v => v.status === 'pending').length,
        errors:  all.filter(v => v.status === 'error').length,
      })
    }
    setLoading(false)
  }

  async function handleSync() {
    setSyncing(true)
    try {
      const res = await fetch('/api/youtube/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: CHANNEL_ID }),
      })
      const data = await res.json()
      if (data.success) {
        alert(`Синк завершён: ${data.synced} видео загружено`)
        loadVideos()
      } else {
        alert('Ошибка: ' + data.error)
      }
    } finally {
      setSyncing(false)
    }
  }

  const filters = ['all', 'pending', 'transcribing', 'generating', 'review', 'done', 'error']

  return (
    <div className="min-h-screen bg-bg text-cream font-sans">

      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center gap-3">
        <div>
          <span className="text-[13px] text-muted">ContentOS /</span>
          <span className="text-[15px] font-medium ml-1.5">YouTube</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={handleSync}
          disabled={syncing}
          className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
            syncing
              ? 'bg-[#333] text-muted cursor-not-allowed'
              : 'bg-gold text-bg cursor-pointer hover:bg-gold/90'
          }`}
        >
          {syncing ? 'Синхронизация...' : '\u2193 Синхронизировать канал'}
        </button>
      </div>

      <div className="p-5 flex flex-col gap-4">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2.5">
          {[
            { label: 'Всего видео',       value: stats.total,   cls: 'text-cream' },
            { label: 'Готово',             value: stats.done,    cls: 'text-green' },
            { label: 'Ожидают обработки',  value: stats.pending, cls: 'text-warn' },
            { label: 'Ошибки',             value: stats.errors,  cls: 'text-danger' },
          ].map(s => (
            <div key={s.label} className="bg-surface border border-border rounded-[10px] px-4 py-3.5">
              <div className="text-[11px] text-muted uppercase tracking-wider mb-1.5">{s.label}</div>
              <div className={`text-2xl font-medium ${s.cls}`}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-1.5">
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-[11px] cursor-pointer transition-colors ${
                filter === f
                  ? 'border border-gold bg-gold/10 text-gold'
                  : 'border border-border text-muted hover:text-cream'
              }`}
            >
              {f === 'all' ? 'Все' : STATUS_LABELS[f]?.label || f}
            </button>
          ))}
        </div>

        {/* Video list */}
        <div className="bg-surface border border-border rounded-[10px] overflow-hidden">

          {/* Table header */}
          <div className="grid grid-cols-[48px_1fr_100px_90px_80px_80px] gap-3 px-4 py-2.5 border-b border-border">
            {['', 'Видео', 'Статус', 'Просмотры', 'Длина', 'AI'].map((h, i) => (
              <span key={i} className="text-[10px] text-dim uppercase tracking-wider">{h}</span>
            ))}
          </div>

          {loading ? (
            <div className="py-8 text-center text-muted text-[13px]">Загрузка...</div>
          ) : videos.length === 0 ? (
            <div className="py-8 text-center text-muted text-[13px]">
              Нет видео. Нажми &laquo;Синхронизировать канал&raquo; чтобы загрузить.
            </div>
          ) : (
            videos.map(v => {
              const st = STATUS_LABELS[v.status] || STATUS_LABELS.pending
              const dotCls = STATUS_DOT[v.status] || STATUS_DOT.pending
              return (
                <div
                  key={v.id}
                  className="grid grid-cols-[48px_1fr_100px_90px_80px_80px] gap-3 px-4 py-2.5 border-b border-border/50 items-center cursor-pointer hover:bg-[#1e1e21] transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="w-12 h-[30px] rounded bg-[#2a2a2e] overflow-hidden shrink-0">
                    {v.current_thumbnail && (
                      <img src={v.current_thumbnail} className="w-full h-full object-cover" alt="" />
                    )}
                  </div>

                  {/* Title */}
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-cream truncate">
                      {v.generated_title || v.current_title}
                    </div>
                    <div className="text-[10px] text-muted mt-0.5">
                      {new Date(v.published_at).toLocaleDateString('ru-RU')}
                      {v.generated_title && <span className="text-green ml-1.5">&#10003; обновлён</span>}
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-center gap-1.5">
                    <div className={`w-[5px] h-[5px] rounded-full shrink-0 ${dotCls}`} />
                    <span className={`text-[10px] whitespace-nowrap ${st.color}`}>{st.label}</span>
                  </div>

                  {/* Views */}
                  <div className="text-[11px] text-muted">{fmtViews(v.view_count)}</div>

                  {/* Duration */}
                  <div className="text-[11px] text-muted">{fmtDuration(v.duration_seconds)}</div>

                  {/* AI Score */}
                  <div className={`text-[11px] ${
                    v.ai_score
                      ? v.ai_score > 70 ? 'text-green' : v.ai_score > 40 ? 'text-warn' : 'text-danger'
                      : 'text-dim'
                  }`}>
                    {v.ai_score ? `${v.ai_score}%` : '\u2014'}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
