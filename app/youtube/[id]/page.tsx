'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Play, Sparkles, Clock, Eye, ThumbsUp,
  Check, X, Loader2, ExternalLink, Tag, FileText, Scissors
} from 'lucide-react'
import { StatusStepper } from '@/components/youtube/StatusStepper'
import { TranscriptViewer } from '@/components/youtube/TranscriptViewer'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

interface VideoDetail {
  id: string
  yt_video_id: string
  current_title: string
  current_description: string
  current_tags: string[] | null
  current_thumbnail: string
  duration_seconds: number
  published_at: string
  view_count: number
  like_count: number
  status: string
  transcript: string | null
  transcript_chunks: { start: number; end: number; text: string }[] | null
  generated_title: string | null
  generated_description: string | null
  generated_tags: string[] | null
  generated_timecodes: { time: string; label: string }[] | null
  generated_clips: { start: number; end: number; title: string; type: string }[] | null
  thumbnail_url: string | null
  ai_score: number | null
  is_approved: boolean
  is_published_back: boolean
  error_message: string | null
}

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toString()
}

export default function VideoDetailPage() {
  const params = useParams()
  const router = useRouter()
  const videoId = params.id as string

  const [video, setVideo] = useState<VideoDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  const loadVideo = useCallback(async () => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/yt_videos?id=eq.${videoId}&select=*`, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      })
      const data = await res.json()
      if (data?.[0]) setVideo(data[0])
    } catch (err) {
      console.error('Failed to load video:', err)
    } finally {
      setLoading(false)
    }
  }, [videoId])

  useEffect(() => { loadVideo() }, [loadVideo])

  const runProcess = async (endpoint: string, label: string) => {
    setProcessing(label)
    try {
      // Fire request — don't wait for completion
      fetch(`/api/process/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      }).catch(() => {})

      // Poll for status changes
      const startStatus = video?.status
      let attempts = 0
      const maxAttempts = 120 // 10 minutes max
      const poll = setInterval(async () => {
        attempts++
        await loadVideo()
        // Check if status changed from the initial processing state
        const current = document.querySelector('[data-video-status]')?.getAttribute('data-video-status')
        if (attempts >= maxAttempts) {
          clearInterval(poll)
          setProcessing(null)
        }
      }, 5000)

      // Also watch for status changes via state
      const checkDone = setInterval(() => {
        if (!processing) {
          clearInterval(checkDone)
          clearInterval(poll)
        }
      }, 1000)

      // Wait a moment then start checking
      await new Promise(r => setTimeout(r, 3000))
      await loadVideo()
    } catch (err: any) {
      alert(`Ошибка: ${err.message}`)
      setProcessing(null)
    }
  }

  // Auto-clear processing state when video status changes
  useEffect(() => {
    if (!processing || !video) return
    const isStillProcessing = ['transcribing', 'generating', 'thumbnail', 'publishing'].includes(video.status)
    if (!isStillProcessing) {
      setProcessing(null)
    }
  }, [video?.status, processing])

  const toggleApproval = async () => {
    if (!video || !SUPABASE_URL || !SUPABASE_KEY) return
    const newVal = !video.is_approved
    await fetch(`${SUPABASE_URL}/rest/v1/yt_videos?id=eq.${videoId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ is_approved: newVal }),
    })
    await loadVideo()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-white/40" />
      </div>
    )
  }

  if (!video) {
    return (
      <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center">
        <div className="text-white/40">Видео не найдено</div>
      </div>
    )
  }

  const canTranscribe = video.status === 'pending' || video.status === 'error'
  const canGenerate = (video.status === 'generating' || video.status === 'error') && !!video.transcript
  const canThumbnail = (video.status === 'thumbnail' || video.status === 'error') && !!video.generated_title
  const canPublish = video.status === 'review' && video.is_approved

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans">
      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => router.push('/youtube')}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-medium truncate">{video.current_title}</h1>
            <div className="flex items-center gap-4 mt-1 text-xs text-white/40">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(video.duration_seconds)}</span>
              <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatCount(video.view_count)}</span>
              <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{formatCount(video.like_count)}</span>
              {video.ai_score !== null && (
                <span className="flex items-center gap-1 text-purple-400"><Sparkles className="w-3 h-3" />{video.ai_score}</span>
              )}
            </div>
          </div>
          <a
            href={`https://youtube.com/watch?v=${video.yt_video_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Status Stepper */}
        <div className="mb-6 p-3 bg-white/[0.02] rounded-xl border border-white/[0.06]">
          <StatusStepper status={video.status} />
          {video.error_message && (
            <p className="text-xs text-red-400 mt-2 px-2">{video.error_message}</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column: Video + Transcript */}
          <div className="lg:col-span-2 space-y-6">
            {/* YouTube Embed */}
            <div className="aspect-video rounded-xl overflow-hidden bg-black">
              <iframe
                src={`https://www.youtube.com/embed/${video.yt_video_id}`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>

            {/* Transcript */}
            <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
              <h3 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" /> Транскрипт
              </h3>
              <TranscriptViewer
                chunks={video.transcript_chunks}
                transcript={video.transcript}
              />
            </div>
          </div>

          {/* Right Column: AI Results + Actions */}
          <div className="space-y-4">

            {/* Action Buttons */}
            <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06] space-y-2">
              <h3 className="text-sm font-medium text-white/60 mb-3">Действия</h3>

              <button
                onClick={() => runProcess('transcribe', 'Транскрипция')}
                disabled={!canTranscribe || !!processing}
                className="w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
              >
                {processing === 'Транскрипция' ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                Транскрибировать
              </button>

              <button
                onClick={() => runProcess('generate', 'AI генерация')}
                disabled={!canGenerate || !!processing}
                className="w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-purple-500/10 text-purple-400 hover:bg-purple-500/20"
              >
                {processing === 'AI генерация' ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                Сгенерировать
              </button>

              <button
                onClick={() => runProcess('thumbnail', 'Обложка')}
                disabled={!canThumbnail || !!processing}
                className="w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
              >
                {processing === 'Обложка' ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                Обложка
              </button>

              <div className="border-t border-white/[0.06] pt-2 mt-2">
                <button
                  onClick={toggleApproval}
                  disabled={video.status !== 'review' || !!processing}
                  className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                    video.is_approved
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-white/5 text-white/60 hover:bg-white/10'
                  }`}
                >
                  {video.is_approved ? <><Check className="w-4 h-4 inline mr-2" />Одобрено</> : 'Одобрить'}
                </button>

                <button
                  onClick={() => runProcess('publish', 'Публикация')}
                  disabled={!canPublish || !!processing}
                  className="w-full mt-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                >
                  {processing === 'Публикация' ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                  Опубликовать на YouTube
                </button>
              </div>
            </div>

            {/* Generated Title */}
            {video.generated_title && (
              <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                <h3 className="text-sm font-medium text-white/60 mb-2">AI Заголовок</h3>
                <p className="text-sm text-white/90">{video.generated_title}</p>
              </div>
            )}

            {/* Generated Description */}
            {video.generated_description && (
              <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                <h3 className="text-sm font-medium text-white/60 mb-2">AI Описание</h3>
                <p className="text-xs text-white/70 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">
                  {video.generated_description}
                </p>
              </div>
            )}

            {/* Tags */}
            {video.generated_tags && video.generated_tags.length > 0 && (
              <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                <h3 className="text-sm font-medium text-white/60 mb-2 flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5" /> Теги
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {video.generated_tags.map((tag, i) => (
                    <span key={i} className="px-2 py-0.5 bg-white/5 rounded text-xs text-white/50">{tag}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Timecodes */}
            {video.generated_timecodes && video.generated_timecodes.length > 0 && (
              <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                <h3 className="text-sm font-medium text-white/60 mb-2 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" /> Тайм-коды
                </h3>
                <div className="space-y-1">
                  {video.generated_timecodes.map((tc, i) => (
                    <div key={i} className="flex gap-3 text-xs">
                      <span className="text-purple-400 font-mono w-10 shrink-0">{tc.time}</span>
                      <span className="text-white/60">{tc.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clips */}
            {video.generated_clips && video.generated_clips.length > 0 && (
              <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                <h3 className="text-sm font-medium text-white/60 mb-2 flex items-center gap-2">
                  <Scissors className="w-3.5 h-3.5" /> Клипы
                </h3>
                <div className="space-y-2">
                  {video.generated_clips.map((clip, i) => (
                    <div key={i} className="flex items-center gap-3 py-1">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        clip.type === 'short' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'
                      }`}>{clip.type}</span>
                      <span className="text-xs text-white/60 flex-1">{clip.title}</span>
                      <span className="text-[10px] text-white/30 font-mono">
                        {formatDuration(clip.start)}-{formatDuration(clip.end)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Thumbnail Comparison */}
            {(video.thumbnail_url || video.current_thumbnail) && (
              <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                <h3 className="text-sm font-medium text-white/60 mb-2">Обложка</h3>
                <div className="space-y-2">
                  {video.thumbnail_url && (
                    <div>
                      <span className="text-[10px] text-purple-400 mb-1 block">AI</span>
                      <img src={video.thumbnail_url} alt="AI thumbnail" className="w-full rounded-lg" />
                    </div>
                  )}
                  <div>
                    <span className="text-[10px] text-white/30 mb-1 block">YouTube</span>
                    <img src={video.current_thumbnail} alt="Current thumbnail" className="w-full rounded-lg" />
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
