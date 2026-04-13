'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { motion } from 'framer-motion'
import { Video, Film, Mic, RefreshCw, Eye, Clock, Sparkles, AlertCircle, EyeOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import Link from 'next/link'

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

type VideoItem = {
  id: string
  yt_video_id: string
  current_title: string
  current_thumbnail: string
  duration_seconds: number
  published_at: string
  view_count: number
  like_count: number
  status: string
  ai_score: number | null
  is_approved: boolean
  is_published_back: boolean
  generated_title: string | null
  privacy_status: string | null
}

type ContentType = 'podcasts' | 'videos' | 'shorts' | 'queue'

const SHORTS_MAX = 180
const VIDEO_MAX = 3000

function classifyVideo(v: VideoItem): 'podcasts' | 'videos' | 'shorts' {
  if (v.duration_seconds <= SHORTS_MAX) return 'shorts'
  if (v.duration_seconds > VIDEO_MAX) return 'podcasts'
  return 'videos'
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending:      { label: 'Ожидает',      color: 'text-muted',        dot: 'bg-muted' },
  transcribing: { label: 'Транскрипция', color: 'text-blue-500',     dot: 'bg-blue-500' },
  producing:    { label: 'AI продюсер',  color: 'text-purple-500',   dot: 'bg-purple-500' },
  generating:   { label: 'AI',           color: 'text-purple-500',   dot: 'bg-purple-500' },
  thumbnail:    { label: 'Обложка',      color: 'text-warn',         dot: 'bg-warn' },
  review:       { label: 'Проверка',     color: 'text-warn',         dot: 'bg-warn' },
  publishing:   { label: 'Публикация',   color: 'text-green',        dot: 'bg-green' },
  done:         { label: 'Готово',       color: 'text-green',        dot: 'bg-green' },
  error:        { label: 'Ошибка',       color: 'text-red-500',      dot: 'bg-red-500' },
}

function fmtDuration(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

function fmtViews(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K'
  return String(n)
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface YtChannel { id: string; title: string; yt_channel_id: string; thumbnail_url: string | null }

export default function YouTubePage() {
  const supabaseRef = useRef<SupabaseClient | null>(null)
  const [configured, setConfigured] = useState(false)
  const [ytChannels, setYtChannels] = useState<YtChannel[]>([])
  const [activeChannelDbId, setActiveChannelDbId] = useState<string | null>(null)
  const [activeYtChannelId, setActiveYtChannelId] = useState<string | null>(null)
  const [allVideos, setAllVideos] = useState<VideoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState<ContentType>('podcasts')
  const [statusFilter, setStatusFilter] = useState<string | null>(null)

  useEffect(() => {
    supabaseRef.current = getSupabase()
    if (supabaseRef.current) setConfigured(true)
    // Load channels for current project
    fetch('/api/projects').then(r => r.json()).then(async ({ channels }) => {
      const ytChs: YtChannel[] = (channels ?? []).filter((c: any) => c.yt_channel_id)
      setYtChannels(ytChs)
      // Pick active from session, fallback to first
      const session = await fetch('/api/auth/session').then(r => r.json())
      const active = ytChs.find(c => c.yt_channel_id === session.activeChannelId) ?? ytChs[0] ?? null
      if (active) {
        setActiveChannelDbId(active.id)
        setActiveYtChannelId(active.yt_channel_id)
      }
    })
  }, [])

  useEffect(() => { if (configured && activeChannelDbId) loadVideos() }, [configured, activeChannelDbId])

  // Auto-switch to first visible tab after videos load
  useEffect(() => {
    const visible = [
      { id: 'podcasts' as ContentType, count: allVideos.filter(v => classifyVideo(v) === 'podcasts').length },
      { id: 'videos'   as ContentType, count: allVideos.filter(v => classifyVideo(v) === 'videos').length },
      { id: 'shorts'   as ContentType, count: allVideos.filter(v => classifyVideo(v) === 'shorts').length },
      { id: 'queue'    as ContentType, count: allVideos.filter(v => !v.is_published_back && v.status !== 'done').length },
    ].filter(t => t.count > 0)
    if (visible.length > 0 && !visible.find(t => t.id === activeTab)) {
      setActiveTab(visible[0].id)
    }
  }, [allVideos])

  function selectChannel(ch: YtChannel) {
    setActiveChannelDbId(ch.id)
    setActiveYtChannelId(ch.yt_channel_id)
    setActiveTab('podcasts')
    // Persist to session
    fetch('/api/auth/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: ch.yt_channel_id }),
    })
  }

  async function loadVideos() {
    const sb = supabaseRef.current
    if (!sb || !activeChannelDbId) return
    setLoading(true)
    const { data } = await sb
      .from('yt_videos')
      .select('id, yt_video_id, current_title, current_thumbnail, current_description, duration_seconds, published_at, view_count, like_count, status, ai_score, is_approved, is_published_back, generated_title, generated_description, privacy_status, guest_name, guest_title, parent_video_id, shorts_status')
      .eq('channel_id', activeChannelDbId)
      .order('published_at', { ascending: false })
    setAllVideos(data || [])
    setLoading(false)
  }

  async function handleSync() {
    if (!activeYtChannelId) { alert('Выберите канал'); return }
    setSyncing(true)
    try {
      const res = await fetch('/api/youtube/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: activeYtChannelId }),
      })
      const data = await res.json()
      if (data.success) { loadVideos() }
      else if (data.needs_reauth) {
        if (confirm(data.error + '\n\nОткрыть настройки?')) {
          window.location.href = '/settings'
        }
      }
      else alert('Ошибка: ' + data.error)
    } finally {
      setSyncing(false)
    }
  }

  const PROCESSING_STATUSES = ['transcribing', 'producing', 'generating', 'thumbnail', 'publishing']

  const applyStatusFilter = (list: VideoItem[]) => {
    if (!statusFilter) return list
    if (statusFilter === 'processing') return list.filter(v => PROCESSING_STATUSES.includes(v.status))
    return list.filter(v => v.status === statusFilter)
  }

  const videos = allVideos.filter(v => classifyVideo(v) === 'videos')
  const shorts = allVideos.filter(v => classifyVideo(v) === 'shorts')
  const podcasts = allVideos.filter(v => classifyVideo(v) === 'podcasts')
  const queue = allVideos.filter(v => !v.is_published_back && v.status !== 'done')

  const tabs = [
    { id: 'podcasts' as ContentType, label: 'Подкасты', icon: <Mic className="w-4 h-4" />, count: podcasts.length },
    { id: 'videos' as ContentType,   label: 'Видео',    icon: <Video className="w-4 h-4" />, count: videos.length },
    { id: 'shorts' as ContentType,   label: 'Shorts',   icon: <Film className="w-4 h-4" />, count: shorts.length },
    { id: 'queue' as ContentType,    label: 'Очередь',  icon: <AlertCircle className="w-4 h-4" />, count: queue.length },
  ]
  const visibleTabs = tabs.filter(t => t.count > 0)

  const currentVideosRaw =
    activeTab === 'videos'   ? videos :
    activeTab === 'shorts'   ? shorts :
    activeTab === 'queue'    ? queue  : podcasts
  const currentVideos = activeTab === 'shorts' ? currentVideosRaw : applyStatusFilter(currentVideosRaw)

  const STATUS_FILTERS = [
    { id: null, label: 'Все' },
    { id: 'processing', label: 'В обработке' },
    { id: 'review', label: 'На проверке' },
    { id: 'done', label: 'Готово' },
    { id: 'error', label: 'Ошибки' },
    { id: 'pending', label: 'Ожидает' },
  ]

  const stats = {
    total: allVideos.length,
    done:   allVideos.filter(v => v.status === 'done').length,
    errors: allVideos.filter(v => v.status === 'error').length,
    pending: allVideos.filter(v => v.status === 'pending').length,
  }

  return (
    <div className="text-cream font-sans">

      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-sm text-muted">ContentOS</span>
          <span className="text-dim">/</span>
          <span className="text-sm font-medium">YouTube</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-xs text-muted">
          <span>{stats.total} видео</span>
          <span className="text-dim">|</span>
          <span className="text-green">{stats.done} готово</span>
          {stats.pending > 0 && <><span className="text-dim">|</span><span className="text-warn">{stats.pending} ожидает</span></>}
          {stats.errors > 0 && <><span className="text-dim">|</span><span className="text-red-500">{stats.errors} ошибок</span></>}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
            syncing ? 'bg-surface text-muted cursor-not-allowed' : 'bg-accent text-white cursor-pointer hover:opacity-90'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Синхронизация...' : 'Синхронизировать'}
        </button>
      </div>

      {/* Channel selector */}
      {ytChannels.length > 1 && (
        <div className="border-b border-border px-6 flex gap-1 overflow-x-auto">
          {ytChannels.map(ch => (
            <button
              key={ch.id}
              onClick={() => selectChannel(ch)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                ch.id === activeChannelDbId
                  ? 'border-accent text-cream'
                  : 'border-transparent text-muted hover:text-cream'
              }`}
            >
              {ch.thumbnail_url
                ? <img src={ch.thumbnail_url} className="w-5 h-5 rounded-full" alt="" />
                : <div className="w-5 h-5 rounded-full bg-red-500/20" />
              }
              {ch.title}
            </button>
          ))}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-6">

        {!configured && (
          <div className="mb-6 bg-warn/10 border border-warn/20 rounded-lg px-5 py-4">
            <div className="text-warn text-sm font-medium mb-1">Supabase не подключён</div>
            <div className="text-muted text-xs">
              Добавьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в .env.local, затем редеплойте.
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6">
          <div className="relative inline-flex bg-surface rounded-lg p-1 border border-border">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-5 py-2.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === tab.id ? 'text-cream' : 'text-muted hover:text-cream'
                }`}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-bg border border-border rounded-md shadow-surface"
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {tab.icon}
                  {tab.label}
                  <Badge variant={activeTab === tab.id ? 'default' : 'secondary'} className="ml-0.5">
                    {tab.count}
                  </Badge>
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Status filter (hidden for shorts — ShortsEditor has own filters) */}
        {activeTab !== 'shorts' && <div className="flex gap-1.5 mb-4 flex-wrap">
          {STATUS_FILTERS.map(f => {
            const isActive = statusFilter === f.id
            return (
              <button
                key={f.id ?? 'all'}
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'bg-surface text-muted border border-border hover:text-cream'
                }`}
              >
                {f.label}
              </button>
            )
          })}
        </div>}

        {/* Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {loading ? (
            <div className="py-20 text-center text-muted text-sm">Загрузка...</div>
          ) : currentVideos.length === 0 ? (
            <div className="py-20 text-center text-muted text-sm">
              {configured
                ? activeTab === 'queue' ? 'Нет видео в очереди.' : 'Нет контента. Нажмите "Синхронизировать".'
                : 'Подключите Supabase для начала работы.'}
            </div>
          ) : activeTab === 'shorts' ? (
            <ShortsEditor videos={currentVideos as ShortItem[]} channelId={activeYtChannelId} channelDbId={activeChannelDbId} onReload={loadVideos} />
          ) : (
            <VideoGrid videos={currentVideos} />
          )}
        </motion.div>
      </div>
    </div>
  )
}

function VideoGrid({ videos }: { videos: VideoItem[] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {videos.map(v => {
        const st = STATUS_CONFIG[v.status] || STATUS_CONFIG.pending
        return (
          <Link key={v.id} href={`/youtube/${v.id}`}>
          <Card className="group cursor-pointer hover:border-accent/30 transition-colors">
            <div className="aspect-video bg-surface relative overflow-hidden">
              {v.current_thumbnail ? (
                <img src={v.current_thumbnail} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Video className="w-10 h-10 text-dim" />
                </div>
              )}
              <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                {fmtDuration(v.duration_seconds)}
              </div>
              <div className="absolute top-2 left-2 flex items-center gap-1.5">
                <div className="flex items-center gap-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                  <span className={`text-[10px] ${st.color}`}>{st.label}</span>
                </div>
                {v.privacy_status === 'unlisted' && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-black/70 text-amber-400 text-[9px] font-medium">
                    <EyeOff className="w-2.5 h-2.5" />По ссылке
                  </span>
                )}
              </div>
            </div>
            <div className="p-3">
              <div className="text-[13px] font-medium text-cream line-clamp-2 leading-snug mb-2">
                {v.generated_title || v.current_title}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-dim">
                <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmtViews(v.view_count)}</span>
                <span>{fmtDate(v.published_at)}</span>
                {v.ai_score && (
                  <span className="flex items-center gap-1 text-purple">
                    <Sparkles className="w-3 h-3" />{v.ai_score}%
                  </span>
                )}
              </div>
            </div>
          </Card>
          </Link>
        )
      })}
    </div>
  )
}

type ShortItem = VideoItem & {
  generated_description?: string | null
  guest_name?: string | null
  guest_title?: string | null
  parent_video_id?: string | null
  shorts_status?: string | null
  current_description?: string | null
}

type PodcastOption = { id: string; yt_video_id: string; current_title: string }

function ShortsEditor({
  videos, channelId, channelDbId, onReload,
}: {
  videos: ShortItem[]
  channelId: string | null
  channelDbId: string | null
  onReload: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [edits, setEdits] = useState<Record<string, Partial<ShortItem>>>({})
  const [saving, setSaving] = useState(false)
  const [linking, setLinking] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [statusFilter, setShortsStatusFilter] = useState<string | null>(null)
  const [podcasts, setPodcasts] = useState<PodcastOption[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  useEffect(() => {
    if (!channelDbId) return
    const sb = getSupabase()
    if (!sb) return
    sb.from('yt_videos')
      .select('id, yt_video_id, current_title')
      .eq('channel_id', channelDbId)
      .gt('duration_seconds', 180)
      .order('published_at', { ascending: false })
      .then(({ data }) => setPodcasts(data ?? []))
  }, [channelDbId])

  const filteredVideos = statusFilter
    ? videos.filter(v => (v.shorts_status ?? 'pending') === statusFilter)
    : videos

  const searchFiltered = searchTerm
    ? filteredVideos.filter(v =>
        (v.current_title ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.generated_title ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.guest_name ?? '').toLowerCase().includes(searchTerm.toLowerCase())
      )
    : filteredVideos

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === searchFiltered.length) setSelected(new Set())
    else setSelected(new Set(searchFiltered.map(v => v.id)))
  }

  const setEdit = (id: string, field: string, value: string | null) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function handleAutoLink() {
    if (!channelDbId) return
    setLinking(true)
    try {
      const res = await fetch('/api/shorts/auto-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channelDbId }),
      })
      const data = await res.json()
      if (data.success) {
        alert(`Привязано: ${data.linked}, уже было: ${data.already}, без связи: ${data.unmatched}`)
        onReload()
      } else alert('Ошибка: ' + data.error)
    } finally { setLinking(false) }
  }

  async function handleBatchGenerate() {
    if (!channelDbId) return
    const ids = selected.size > 0 ? Array.from(selected) : undefined
    setGenerating(true)
    try {
      const res = await fetch('/api/shorts/batch-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: channelDbId, videoIds: ids }),
      })
      const data = await res.json()
      if (data.success) {
        alert(`В очереди: ${data.queued} шортсов`)
      } else alert('Ошибка: ' + data.error)
    } finally { setGenerating(false) }
  }

  async function handleSaveEdits() {
    const updates = Object.entries(edits).map(([id, fields]) => ({ id, ...fields }))
    if (!updates.length) return
    setSaving(true)
    try {
      const res = await fetch('/api/shorts/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      const data = await res.json()
      if (data.success) {
        setEdits({})
        onReload()
      } else alert('Ошибка: ' + data.error)
    } finally { setSaving(false) }
  }

  async function handleBatchPublish() {
    const ids = Array.from(selected)
    if (!ids.length) { alert('Выберите шортсы для публикации'); return }
    if (!confirm(`Опубликовать ${ids.length} шортсов на YouTube?`)) return
    setPublishing(true)
    try {
      const res = await fetch('/api/shorts/batch-publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoIds: ids }),
      })
      const data = await res.json()
      if (data.success) {
        alert(`В очереди на публикацию: ${data.queued}`)
        setSelected(new Set())
        onReload()
      } else alert('Ошибка: ' + data.error)
    } finally { setPublishing(false) }
  }

  async function handleBatchApprove() {
    const ids = Array.from(selected)
    if (!ids.length) return
    const updates = ids.map(id => ({ id, shorts_status: 'approved', is_approved: true }))
    setSaving(true)
    try {
      await fetch('/api/shorts/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      })
      setSelected(new Set())
      onReload()
    } finally { setSaving(false) }
  }

  const counts = {
    pending: videos.filter(v => (v.shorts_status ?? 'pending') === 'pending').length,
    generated: videos.filter(v => v.shorts_status === 'generated').length,
    approved: videos.filter(v => v.shorts_status === 'approved').length,
    published: videos.filter(v => v.shorts_status === 'published').length,
    linked: videos.filter(v => v.parent_video_id).length,
  }

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center gap-4 text-xs text-muted">
        <span>{videos.length} шортсов</span>
        <span className="text-dim">|</span>
        <span className="text-blue-400">{counts.linked} привязано</span>
        <span className="text-dim">|</span>
        <span className="text-purple">{counts.generated} сгенерировано</span>
        <span className="text-dim">|</span>
        <span className="text-warn">{counts.approved} одобрено</span>
        <span className="text-dim">|</span>
        <span className="text-green">{counts.published} опубликовано</span>
      </div>

      {/* Actions bar */}
      <div className="flex flex-wrap gap-2">
        <button onClick={handleAutoLink} disabled={linking}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 disabled:opacity-50 transition-colors">
          {linking ? 'Привязка...' : 'Привязать к подкастам'}
        </button>
        <button onClick={handleBatchGenerate} disabled={generating}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple/10 text-purple border border-purple/20 hover:bg-purple/20 disabled:opacity-50 transition-colors">
          {generating ? 'В очереди...' : selected.size > 0 ? `Сгенерировать (${selected.size})` : 'Сгенерировать все'}
        </button>
        {selected.size > 0 && (
          <>
            <button onClick={handleBatchApprove} disabled={saving}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-warn/10 text-warn border border-warn/20 hover:bg-warn/20 disabled:opacity-50 transition-colors">
              Одобрить ({selected.size})
            </button>
            <button onClick={handleBatchPublish} disabled={publishing}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green/10 text-green border border-green/20 hover:bg-green/20 disabled:opacity-50 transition-colors">
              {publishing ? 'Публикация...' : `Опубликовать (${selected.size})`}
            </button>
          </>
        )}
        {Object.keys(edits).length > 0 && (
          <button onClick={handleSaveEdits} disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 disabled:opacity-50 transition-colors">
            {saving ? 'Сохранение...' : `Сохранить изменения (${Object.keys(edits).length})`}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          {[
            { id: null, label: 'Все', count: videos.length },
            { id: 'pending', label: 'Ожидает', count: counts.pending },
            { id: 'generated', label: 'Сгенерировано', count: counts.generated },
            { id: 'approved', label: 'Одобрено', count: counts.approved },
            { id: 'published', label: 'Опубликовано', count: counts.published },
          ].map(f => (
            <button key={f.id ?? 'all'} onClick={() => setShortsStatusFilter(f.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                statusFilter === f.id
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'bg-surface text-muted border border-border hover:text-cream'
              }`}>
              {f.label} ({f.count})
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <input
          type="text"
          placeholder="Поиск по заголовку, гостю..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="px-3 py-1.5 rounded-lg text-xs bg-surface border border-border text-cream placeholder:text-dim focus:outline-none focus:border-accent/50 w-64"
        />
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface border-b border-border text-muted">
              <th className="w-8 px-2 py-2">
                <input type="checkbox" checked={selected.size === searchFiltered.length && searchFiltered.length > 0}
                  onChange={toggleAll} className="rounded border-border accent-accent" />
              </th>
              <th className="px-3 py-2 text-left font-medium">Текущий заголовок</th>
              <th className="px-3 py-2 text-left font-medium w-[300px]">Новый заголовок</th>
              <th className="px-3 py-2 text-left font-medium w-[140px]">Гость</th>
              <th className="px-3 py-2 text-left font-medium w-[180px]">Подкаст</th>
              <th className="px-3 py-2 text-center font-medium w-16">Просм.</th>
              <th className="px-3 py-2 text-center font-medium w-20">Статус</th>
            </tr>
          </thead>
          <tbody>
            {searchFiltered.map(v => {
              const edited = edits[v.id] ?? {}
              const shortsStatus = (edited.shorts_status as string) ?? v.shorts_status ?? 'pending'
              const statusColors: Record<string, string> = {
                pending: 'bg-surface text-muted',
                generated: 'bg-purple/10 text-purple',
                approved: 'bg-warn/10 text-warn',
                published: 'bg-green/10 text-green',
              }
              const parentPodcast = podcasts.find(p => p.id === (edited.parent_video_id as string ?? v.parent_video_id))

              return (
                <tr key={v.id} className="border-b border-border/50 hover:bg-surface/50 transition-colors">
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" checked={selected.has(v.id)}
                      onChange={() => toggleSelect(v.id)} className="rounded border-border accent-accent" />
                  </td>
                  <td className="px-3 py-2">
                    <a href={`https://youtube.com/shorts/${v.yt_video_id}`} target="_blank" rel="noopener"
                      className="text-cream hover:text-accent transition-colors line-clamp-2 leading-snug">
                      {v.current_title}
                    </a>
                    <div className="text-dim mt-0.5">{fmtDuration(v.duration_seconds)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={(edited.generated_title as string) ?? v.generated_title ?? ''}
                      onChange={e => setEdit(v.id, 'generated_title', e.target.value)}
                      placeholder="AI сгенерирует..."
                      className="w-full px-2 py-1 rounded text-xs bg-bg border border-border text-cream placeholder:text-dim focus:outline-none focus:border-accent/50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="text"
                      value={(edited.guest_name as string) ?? v.guest_name ?? ''}
                      onChange={e => setEdit(v.id, 'guest_name', e.target.value)}
                      placeholder="Имя гостя"
                      className="w-full px-2 py-1 rounded text-[11px] bg-bg border border-border text-cream placeholder:text-dim focus:outline-none focus:border-accent/50 mb-0.5"
                    />
                    <input
                      type="text"
                      value={(edited.guest_title as string) ?? v.guest_title ?? ''}
                      onChange={e => setEdit(v.id, 'guest_title', e.target.value)}
                      placeholder="регалия"
                      className="w-full px-2 py-1 rounded text-[11px] bg-bg border border-border text-dim placeholder:text-dim focus:outline-none focus:border-accent/50"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={(edited.parent_video_id as string) ?? v.parent_video_id ?? ''}
                      onChange={e => setEdit(v.id, 'parent_video_id', e.target.value || null)}
                      className="w-full px-2 py-1 rounded text-[11px] bg-bg border border-border text-cream focus:outline-none focus:border-accent/50"
                    >
                      <option value="">— нет —</option>
                      {podcasts.map(p => (
                        <option key={p.id} value={p.id}>
                          {(p.current_title ?? '').slice(0, 50)}
                        </option>
                      ))}
                    </select>
                    {parentPodcast && (
                      <a href={`https://youtube.com/watch?v=${parentPodcast.yt_video_id}`} target="_blank" rel="noopener"
                        className="text-[10px] text-dim hover:text-accent mt-0.5 block truncate">
                        {parentPodcast.current_title?.slice(0, 40)}
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center text-muted">{fmtViews(v.view_count)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColors[shortsStatus] ?? statusColors.pending}`}>
                      {shortsStatus === 'pending' ? 'ожидает' :
                       shortsStatus === 'generated' ? 'готово' :
                       shortsStatus === 'approved' ? 'одобрено' : 'опубл.'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {searchFiltered.length === 0 && (
        <div className="text-center text-muted text-sm py-8">Нет шортсов для отображения</div>
      )}
    </div>
  )
}
