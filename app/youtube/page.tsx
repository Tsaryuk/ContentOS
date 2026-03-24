// app/youtube/page.tsx
// ContentOS — страница управления YouTube
// Часть общей системы управления контентом

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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
  pending:      { label: 'Не начато',    color: '#888' },
  transcribing: { label: 'Транскрипция', color: '#6b9ff0' },
  generating:   { label: 'AI генерация', color: '#a67ff0' },
  thumbnail:    { label: 'Обложка',      color: '#f0b84a' },
  review:       { label: 'На проверке',  color: '#f0b84a' },
  publishing:   { label: 'Публикация',   color: '#4caf82' },
  done:         { label: 'Готово',       color: '#4caf82' },
  error:        { label: 'Ошибка',       color: '#e05a5a' },
}

function fmtDuration(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    : `${m}:${String(sec).padStart(2,'0')}`
}

function fmtViews(n: number) {
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n/1000).toFixed(0) + 'K'
  return String(n)
}

export default function YouTubePage() {
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [stats, setStats] = useState({ total: 0, done: 0, pending: 0, errors: 0 })

  useEffect(() => { loadVideos() }, [filter])

  async function loadVideos() {
    setLoading(true)
    let q = supabase
      .from('yt_videos')
      .select('*')
      .order('published_at', { ascending: false })

    if (filter !== 'all') q = q.eq('status', filter)

    const { data } = await q
    setVideos(data || [])

    // stats
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

  const filters = ['all','pending','transcribing','generating','review','done','error']

  return (
    <div style={{ minHeight: '100vh', background: '#0e0e0f', color: '#f0ede8', fontFamily: 'system-ui, sans-serif' }}>

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <span style={{ fontSize: 13, color: '#7a7875' }}>ContentOS /</span>
          <span style={{ fontSize: 15, fontWeight: 500, marginLeft: 6 }}>YouTube</span>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            background: syncing ? '#333' : '#c4a96a',
            color: syncing ? '#888' : '#0e0e0f',
            border: 'none', borderRadius: 7, padding: '8px 16px',
            fontSize: 12, fontWeight: 600, cursor: syncing ? 'not-allowed' : 'pointer'
          }}
        >
          {syncing ? 'Синхронизация...' : '↓ Синхронизировать канал'}
        </button>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
          {[
            { label: 'Всего видео',       value: stats.total,   color: '#f0ede8' },
            { label: 'Готово',            value: stats.done,    color: '#4caf82' },
            { label: 'Ожидают обработки', value: stats.pending, color: '#f0b84a' },
            { label: 'Ошибки',           value: stats.errors,  color: '#e05a5a' },
          ].map(s => (
            <div key={s.label} style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: '#7a7875', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 24, fontWeight: 500, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 6 }}>
          {filters.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                border: filter === f ? '1px solid #c4a96a' : '1px solid rgba(255,255,255,0.1)',
                background: filter === f ? 'rgba(196,169,106,0.1)' : 'transparent',
                color: filter === f ? '#c4a96a' : '#7a7875',
              }}
            >
              {f === 'all' ? 'Все' : STATUS_LABELS[f]?.label || f}
            </button>
          ))}
        </div>

        {/* Video list */}
        <div style={{ background: '#161618', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' }}>

          {/* Table header */}
          <div style={{ display: 'grid', gridTemplateColumns: '48px 1fr 100px 90px 80px 80px', gap: 12, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            {['', 'Видео', 'Статус', 'Просмотры', 'Длина', 'AI'].map((h,i) => (
              <span key={i} style={{ fontSize: 10, color: '#4a4845', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
            ))}
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#7a7875', fontSize: 13 }}>Загрузка...</div>
          ) : videos.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#7a7875', fontSize: 13 }}>
              Нет видео. Нажми "Синхронизировать канал" чтобы загрузить.
            </div>
          ) : (
            videos.map(v => {
              const st = STATUS_LABELS[v.status] || STATUS_LABELS.pending
              return (
                <div
                  key={v.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '48px 1fr 100px 90px 80px 80px',
                    gap: 12, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                    alignItems: 'center', cursor: 'pointer', transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#1e1e21')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Thumbnail */}
                  <div style={{ width: 48, height: 30, borderRadius: 4, background: '#2a2a2e', overflow: 'hidden', flexShrink: 0 }}>
                    {v.current_thumbnail && (
                      <img src={v.current_thumbnail} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    )}
                  </div>

                  {/* Title */}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: '#f0ede8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {v.generated_title || v.current_title}
                    </div>
                    <div style={{ fontSize: 10, color: '#7a7875', marginTop: 2 }}>
                      {new Date(v.published_at).toLocaleDateString('ru-RU')}
                      {v.generated_title && <span style={{ color: '#4caf82', marginLeft: 6 }}>✓ обновлён</span>}
                    </div>
                  </div>

                  {/* Status */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: st.color, whiteSpace: 'nowrap' }}>{st.label}</span>
                  </div>

                  {/* Views */}
                  <div style={{ fontSize: 11, color: '#7a7875' }}>{fmtViews(v.view_count)}</div>

                  {/* Duration */}
                  <div style={{ fontSize: 11, color: '#7a7875' }}>{fmtDuration(v.duration_seconds)}</div>

                  {/* AI Score */}
                  <div style={{ fontSize: 11, color: v.ai_score ? (v.ai_score > 70 ? '#4caf82' : v.ai_score > 40 ? '#f0b84a' : '#e05a5a') : '#4a4845' }}>
                    {v.ai_score ? `${v.ai_score}%` : '—'}
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
