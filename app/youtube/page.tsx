'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { motion } from 'framer-motion'
import { Video, Film, Mic, RefreshCw, Eye, Clock, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

const CHANNEL_ID = 'UCSNzUPA6aagf1XD37oXQWsw'

type VideoItem = {
  id: string
  yt_video_id: string
  current_title: string
  current_thumbnail: string
  current_description: string
  duration_seconds: number
  published_at: string
  view_count: number
  like_count: number
  status: string
  ai_score: number | null
  is_approved: boolean
  generated_title: string | null
}

type ContentType = 'videos' | 'shorts' | 'podcasts'

const SHORTS_MAX = 180       // до 3 минут
const VIDEO_MAX = 3000       // до 50 минут
// от 50 минут — подкасты

function classifyVideo(v: VideoItem): ContentType {
  if (v.duration_seconds <= SHORTS_MAX) return 'shorts'
  if (v.duration_seconds > VIDEO_MAX) return 'podcasts'
  return 'videos'
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  pending:      { label: 'Ожидает',      color: 'text-white/40', dot: 'bg-white/40' },
  transcribing: { label: 'Транскрипция', color: 'text-blue-400', dot: 'bg-blue-400' },
  generating:   { label: 'AI',           color: 'text-purple-400', dot: 'bg-purple-400' },
  thumbnail:    { label: 'Обложка',      color: 'text-amber-400', dot: 'bg-amber-400' },
  review:       { label: 'Проверка',     color: 'text-amber-400', dot: 'bg-amber-400' },
  publishing:   { label: 'Публикация',   color: 'text-emerald-400', dot: 'bg-emerald-400' },
  done:         { label: 'Готово',        color: 'text-emerald-400', dot: 'bg-emerald-400' },
  error:        { label: 'Ошибка',        color: 'text-red-400', dot: 'bg-red-400' },
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

export default function YouTubePage() {
  const supabaseRef = useRef<SupabaseClient | null>(null)
  if (!supabaseRef.current && typeof window !== 'undefined') {
    supabaseRef.current = getSupabase()
  }
  const supabase = supabaseRef.current
  const configured = !!supabase

  const [allVideos, setAllVideos] = useState<VideoItem[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [activeTab, setActiveTab] = useState<ContentType>('podcasts')

  useEffect(() => { if (configured) loadVideos() }, [configured])

  async function loadVideos() {
    if (!supabase) return
    setLoading(true)
    const { data } = await supabase
      .from('yt_videos')
      .select('*')
      .order('published_at', { ascending: false })
    setAllVideos(data || [])
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
        loadVideos()
      } else {
        alert('Ошибка: ' + data.error)
      }
    } finally {
      setSyncing(false)
    }
  }

  const videos = allVideos.filter(v => classifyVideo(v) === 'videos')
  const shorts = allVideos.filter(v => classifyVideo(v) === 'shorts')
  const podcasts = allVideos.filter(v => classifyVideo(v) === 'podcasts')

  const tabs = [
    { id: 'podcasts' as ContentType, label: 'Подкасты', icon: <Mic className="w-4 h-4" />, count: podcasts.length },
    { id: 'videos' as ContentType, label: 'Видео', icon: <Video className="w-4 h-4" />, count: videos.length },
    { id: 'shorts' as ContentType, label: 'Shorts', icon: <Film className="w-4 h-4" />, count: shorts.length },
  ]

  const currentVideos = activeTab === 'videos' ? videos : activeTab === 'shorts' ? shorts : podcasts

  const stats = {
    total: allVideos.length,
    pending: allVideos.filter(v => v.status === 'pending').length,
    done: allVideos.filter(v => v.status === 'done').length,
    errors: allVideos.filter(v => v.status === 'error').length,
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans">

      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-4 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-sm text-white/40">ContentOS</span>
          <span className="text-white/20">/</span>
          <span className="text-sm font-medium">YouTube</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3 text-xs text-white/40">
          <span>{stats.total} видео</span>
          <span className="text-white/10">|</span>
          <span className="text-emerald-400">{stats.done} готово</span>
          {stats.errors > 0 && (
            <>
              <span className="text-white/10">|</span>
              <span className="text-red-400">{stats.errors} ошибок</span>
            </>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium transition-all ${
            syncing
              ? 'bg-white/5 text-white/30 cursor-not-allowed'
              : 'bg-white text-black cursor-pointer hover:bg-white/90'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Синхронизация...' : 'Синхронизировать'}
        </button>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">

        {!configured && (
          <div className="mb-6 bg-amber-500/10 border border-amber-500/20 rounded-lg px-5 py-4">
            <div className="text-amber-400 text-sm font-medium mb-1">Supabase не подключён</div>
            <div className="text-white/40 text-xs">
              Добавьте NEXT_PUBLIC_SUPABASE_URL и NEXT_PUBLIC_SUPABASE_ANON_KEY в Vercel Settings, затем редеплойте.
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6">
          <div className="relative inline-flex bg-white/[0.03] rounded-lg p-1 border border-white/[0.06]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-5 py-2.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                  activeTab === tab.id
                    ? 'text-white'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="activeTab"
                    className="absolute inset-0 bg-white/[0.08] border border-white/[0.08] rounded-md"
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

        {/* Content */}
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {loading ? (
            <div className="py-20 text-center text-white/30 text-sm">Загрузка...</div>
          ) : currentVideos.length === 0 ? (
            <div className="py-20 text-center text-white/30 text-sm">
              {configured ? 'Нет контента. Нажмите "Синхронизировать".' : 'Подключите Supabase для начала работы.'}
            </div>
          ) : activeTab === 'shorts' ? (
            <ShortsGrid videos={currentVideos} />
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
          <Card key={v.id} className="group cursor-pointer hover:border-white/10 transition-colors">
            <div className="aspect-video bg-white/[0.02] relative overflow-hidden">
              {v.current_thumbnail ? (
                <img src={v.current_thumbnail} className="w-full h-full object-cover" alt="" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Video className="w-10 h-10 text-white/10" />
                </div>
              )}
              <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-mono">
                {fmtDuration(v.duration_seconds)}
              </div>
              <div className="absolute top-2 left-2 flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                <span className={`text-[10px] ${st.color}`}>{st.label}</span>
              </div>
            </div>
            <div className="p-3">
              <div className="text-[13px] font-medium text-white/90 line-clamp-2 leading-snug mb-2">
                {v.generated_title || v.current_title}
              </div>
              <div className="flex items-center gap-3 text-[11px] text-white/30">
                <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmtViews(v.view_count)}</span>
                <span>{fmtDate(v.published_at)}</span>
                {v.ai_score && (
                  <span className="flex items-center gap-1 text-purple-400">
                    <Sparkles className="w-3 h-3" />{v.ai_score}%
                  </span>
                )}
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function ShortsGrid({ videos }: { videos: VideoItem[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {videos.map(v => (
        <Card key={v.id} className="group cursor-pointer hover:border-white/10 transition-colors">
          <div className="aspect-[9/16] bg-white/[0.02] relative overflow-hidden">
            {v.current_thumbnail ? (
              <img src={v.current_thumbnail} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <Film className="w-8 h-8 text-white/10" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            <div className="absolute bottom-2 left-2 right-2">
              <div className="text-white text-[11px] font-medium line-clamp-2 leading-snug">
                {v.current_title}
              </div>
              <div className="text-white/50 text-[10px] mt-1 flex items-center gap-2">
                <span>{fmtViews(v.view_count)}</span>
                <span>{fmtDuration(v.duration_seconds)}</span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

function PodcastList({ videos }: { videos: VideoItem[] }) {
  return (
    <div className="flex flex-col gap-3">
      {videos.map(v => {
        const st = STATUS_CONFIG[v.status] || STATUS_CONFIG.pending
        return (
          <Card key={v.id} className="group cursor-pointer hover:border-white/10 transition-colors">
            <div className="flex gap-4 p-4">
              <div className="w-24 h-24 rounded-lg bg-white/[0.02] overflow-hidden flex-shrink-0">
                {v.current_thumbnail ? (
                  <img src={v.current_thumbnail} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Mic className="w-8 h-8 text-white/10" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-white/90 line-clamp-1 mb-1">
                  {v.generated_title || v.current_title}
                </div>
                <div className="text-xs text-white/30 line-clamp-2 mb-3 leading-relaxed">
                  {v.current_description?.slice(0, 150)}
                </div>
                <div className="flex items-center gap-4 text-[11px] text-white/30">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDuration(v.duration_seconds)}</span>
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{fmtViews(v.view_count)}</span>
                  <span>{fmtDate(v.published_at)}</span>
                  <div className="flex items-center gap-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                    <span className={st.color}>{st.label}</span>
                  </div>
                  {v.ai_score && (
                    <span className="flex items-center gap-1 text-purple-400">
                      <Sparkles className="w-3 h-3" />{v.ai_score}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
