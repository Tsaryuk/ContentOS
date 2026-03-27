'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Clock, Eye, ThumbsUp, Sparkles, ExternalLink,
  Loader2, FileText, Tag, Scissors, MessageSquare, Image,
  User, Rocket, Check
} from 'lucide-react'
import { StatusStepper } from '@/components/youtube/StatusStepper'
import { TranscriptViewer } from '@/components/youtube/TranscriptViewer'
import { VariantSelector } from '@/components/youtube/VariantSelector'
import { ThumbnailGallery } from '@/components/youtube/ThumbnailGallery'
import { ThumbnailStudio } from '@/components/youtube/ThumbnailStudio'
import { ClipList } from '@/components/youtube/ClipList'
import { SocialPreview } from '@/components/youtube/SocialPreview'
import { GuestInfo } from '@/components/youtube/GuestInfo'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

function formatDuration(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
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

  const [video, setVideo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)

  const loadVideo = useCallback(async () => {
    if (!SUPABASE_URL || !SUPABASE_KEY) { setLoading(false); return }
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/yt_videos?id=eq.${videoId}&select=*`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      })
      const data = await res.json()
      if (data?.[0]) setVideo(data[0])
    } catch (err) {
      console.error('Load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [videoId])

  useEffect(() => { loadVideo() }, [loadVideo])

  // Poll while processing
  useEffect(() => {
    if (!video) return
    const active = ['transcribing', 'producing', 'generating', 'thumbnail', 'publishing'].includes(video.status)
    if (!active) { setProcessing(null); return }
    const interval = setInterval(loadVideo, 5000)
    return () => clearInterval(interval)
  }, [video?.status, loadVideo])

  const runProduce = async () => {
    setProcessing('Подготовка выпуска')
    fetch('/api/process/produce', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId }),
    }).catch(() => {})
    setTimeout(loadVideo, 3000)
  }

  const runProcess = async (endpoint: string, label: string) => {
    setProcessing(label)
    fetch(`/api/process/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId }),
    }).catch(() => {})
    setTimeout(loadVideo, 3000)
  }

  const patchVideo = async (data: Record<string, any>) => {
    await fetch(`${SUPABASE_URL}/rest/v1/yt_videos?id=eq.${videoId}`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(data),
    })
    await loadVideo()
  }

  const selectTitle = async (index: number) => {
    const sv = { ...(video.selected_variants ?? {}), title_index: index }
    const title = video.producer_output?.title_variants?.[index]?.text
    await patchVideo({
      selected_variants: sv,
      ...(title ? { generated_title: title } : {}),
    })
  }

  const selectThumbnailByIndex = async (index: number) => {
    const sv = { ...(video.selected_variants ?? {}), thumbnail_text_index: index }
    const url = video.producer_output?.thumbnail_urls?.[index]
    await patchVideo({
      selected_variants: sv,
      ...(url ? { thumbnail_url: url } : {}),
    })
  }

  const selectThumbnailByUrl = async (url: string) => {
    await patchVideo({ thumbnail_url: url })
  }

  const toggleClip = (index: number) => {
    const sv = { ...(video.selected_variants ?? {}) }
    const clips = [...(sv.clips_selected ?? [])]
    const idx = clips.indexOf(index)
    if (idx >= 0) clips.splice(idx, 1)
    else clips.push(index)
    sv.clips_selected = clips
    patchVideo({ selected_variants: sv })
  }

  const toggleShort = (index: number) => {
    const sv = { ...(video.selected_variants ?? {}) }
    const shorts = [...(sv.shorts_selected ?? [])]
    const idx = shorts.indexOf(index)
    if (idx >= 0) shorts.splice(idx, 1)
    else shorts.push(index)
    sv.shorts_selected = shorts
    patchVideo({ selected_variants: sv })
  }

  if (loading) {
    return <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-white/40" /></div>
  }
  if (!video) {
    return <div className="min-h-screen bg-[#09090b] text-white flex items-center justify-center"><div className="text-white/40">Видео не найдено</div></div>
  }

  const po = video.producer_output
  const sv = video.selected_variants ?? {}
  const isProcessing = ['transcribing', 'producing', 'generating', 'thumbnail', 'publishing'].includes(video.status)
  const canProduce = video.status === 'pending' || video.status === 'error' || video.status === 'review'
  const canPublish = video.status === 'review' && video.is_approved

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans">
      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => router.push('/youtube')} className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-medium truncate">{video.current_title}</h1>
            <div className="flex items-center gap-4 mt-1 text-xs text-white/40">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(video.duration_seconds)}</span>
              <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatCount(video.view_count)}</span>
              <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{formatCount(video.like_count)}</span>
              {video.ai_score != null && (
                <span className="flex items-center gap-1 text-purple-400"><Sparkles className="w-3 h-3" />{video.ai_score}</span>
              )}
            </div>
          </div>
          <a href={`https://youtube.com/watch?v=${video.yt_video_id}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Status */}
        <div className="mb-6 p-3 bg-white/[0.02] rounded-xl border border-white/[0.06]">
          <StatusStepper status={video.status} />
          {video.error_message && !video.error_message.startsWith('progress:') && (
            <p className="text-xs text-red-400 mt-2 px-2">{video.error_message}</p>
          )}
          {isProcessing && (
            <div className="flex items-center gap-2 mt-2 px-2 text-xs text-purple-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {video.error_message?.startsWith('progress:')
                ? video.error_message.replace('progress:', '')
                : processing || 'Обработка...'}
            </div>
          )}
        </div>

        {/* Main action button */}
        {!po && (
          <div className="mb-6">
            <button
              onClick={runProduce}
              disabled={!canProduce || isProcessing}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-purple-600 to-purple-500 text-white font-medium text-sm hover:from-purple-500 hover:to-purple-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              Подготовить выпуск
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Video embed */}
            <div className="aspect-video rounded-xl overflow-hidden bg-black">
              <iframe src={`https://www.youtube.com/embed/${video.yt_video_id}`} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            </div>

            {/* Producer Output Sections */}
            {po && (
              <>
                {/* Guest Info */}
                <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                  <h3 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2"><User className="w-4 h-4" /> Гость</h3>
                  <GuestInfo guest={po.guest_info} onUpdate={(g) => patchVideo({ producer_output: { ...po, guest_info: g } })} />
                </div>

                {/* Titles */}
                <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                  <h3 className="text-sm font-medium text-white/60 mb-3">Заголовок</h3>
                  <VariantSelector
                    variants={po.title_variants}
                    selectedIndex={sv.title_index}
                    onSelect={selectTitle}
                  />
                </div>

                {/* Description */}
                <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                  <h3 className="text-sm font-medium text-white/60 mb-3">Описание</h3>
                  <div className="text-xs text-white/70 whitespace-pre-wrap max-h-64 overflow-y-auto leading-relaxed">
                    {po.description}
                  </div>
                </div>

                {/* Tags */}
                {po.tags?.length > 0 && (
                  <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                    <h3 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2"><Tag className="w-4 h-4" /> Теги ({po.tags.length})</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {po.tags.map((tag: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-white/5 rounded text-xs text-white/50">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Timecodes */}
                {po.timecodes?.length > 0 && (
                  <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                    <h3 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2"><Clock className="w-4 h-4" /> Тайм-коды ({po.timecodes.length})</h3>
                    <div className="space-y-1">
                      {po.timecodes.map((tc: any, i: number) => (
                        <div key={i} className="flex gap-3 text-xs">
                          <span className="text-purple-400 font-mono w-14 shrink-0">{tc.time}</span>
                          <span className="text-white/60">{tc.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Clips & Shorts */}
                <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                  <h3 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2"><Scissors className="w-4 h-4" /> Контент для нарезки</h3>
                  <ClipList
                    clips={po.clip_suggestions ?? []}
                    shorts={po.short_suggestions ?? []}
                    selectedClips={sv.clips_selected ?? []}
                    selectedShorts={sv.shorts_selected ?? []}
                    onToggleClip={toggleClip}
                    onToggleShort={toggleShort}
                  />
                </div>

                {/* Social Previews */}
                {po.social_drafts?.length > 0 && (
                  <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                    <h3 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Анонсы</h3>
                    <SocialPreview drafts={po.social_drafts} />
                  </div>
                )}
              </>
            )}

            {/* Transcript */}
            <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
              <h3 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2"><FileText className="w-4 h-4" /> Транскрипт</h3>
              <TranscriptViewer videoTitle={video.current_title} chunks={video.transcript_chunks} transcript={video.transcript} />
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-4">

            {/* Actions */}
            <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06] space-y-2 sticky top-6">
              <h3 className="text-sm font-medium text-white/60 mb-3">Действия</h3>

              {po ? (
                <>
                  <button
                    onClick={runProduce}
                    disabled={isProcessing}
                    className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-30"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                    Перегенерировать
                  </button>

                  <div className="border-t border-white/[0.06] pt-2 mt-2">
                    <button
                      onClick={() => patchVideo({ is_approved: !video.is_approved })}
                      disabled={video.status !== 'review' || isProcessing}
                      className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 ${
                        video.is_approved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-white/60 hover:bg-white/10'
                      }`}
                    >
                      {video.is_approved ? <><Check className="w-4 h-4 inline mr-2" />Одобрено</> : 'Одобрить'}
                    </button>

                    <button
                      onClick={() => runProcess('publish', 'Публикация')}
                      disabled={!canPublish || isProcessing}
                      className="w-full mt-2 py-2.5 px-4 rounded-lg text-sm font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-30"
                    >
                      Опубликовать на YouTube
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button onClick={() => runProcess('transcribe', 'Транскрипция')} disabled={!(video.status === 'pending' || video.status === 'error') || isProcessing}
                    className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-30">
                    Транскрибировать
                  </button>
                  <button onClick={() => runProcess('generate', 'AI генерация')} disabled={!((video.status === 'generating' || video.status === 'error') && video.transcript) || isProcessing}
                    className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors disabled:opacity-30">
                    Сгенерировать
                  </button>
                </>
              )}
            </div>

            {/* Thumbnail Studio */}
            {po && (
              <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                <ThumbnailStudio
                  videoId={video.id}
                  textVariants={po.thumbnail_spec?.text_overlay_variants ?? []}
                  currentThumbnail={video.current_thumbnail}
                  generatedUrls={po.thumbnail_urls}
                  savedPhotos={po.saved_photos}
                  savedReference={po.saved_reference}
                  onSelect={selectThumbnailByUrl}
                />
              </div>
            )}

            {/* Thumbnails (legacy gallery) */}
            {!po && video.thumbnail_url && (
              <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                <h3 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2"><Image className="w-4 h-4" /> Обложки</h3>
                <ThumbnailGallery
                  thumbnailUrls={[video.thumbnail_url]}
                  currentThumbnail={video.current_thumbnail}
                  selectedIndex={0}
                  onSelect={selectThumbnailByIndex}
                />
              </div>
            )}

            {/* AI Score */}
            {po?.ai_score != null && (
              <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                <h3 className="text-sm font-medium text-white/60 mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Score</h3>
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-bold text-purple-400">{po.ai_score}</div>
                  <div className="flex-1">
                    <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${po.ai_score}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Summary */}
            {po?.content_summary && (
              <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
                <h3 className="text-sm font-medium text-white/60 mb-2">Резюме</h3>
                <p className="text-xs text-white/50 leading-relaxed">{po.content_summary}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
