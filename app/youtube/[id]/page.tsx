'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Clock, Eye, ThumbsUp, Sparkles, ExternalLink,
  Loader2, FileText, Tag, Scissors, MessageSquare, Image,
  User, Rocket, Check, Copy, Save, GalleryHorizontalEnd, Link as LinkIcon,
  Trash2,
} from 'lucide-react'
import { StatusStepper } from '@/components/youtube/StatusStepper'
import { TranscriptViewer } from '@/components/youtube/TranscriptViewer'
import { VariantSelector } from '@/components/youtube/VariantSelector'
import { ThumbnailGallery } from '@/components/youtube/ThumbnailGallery'
import { ThumbnailStudio } from '@/components/youtube/ThumbnailStudio'
import { ClipList } from '@/components/youtube/ClipList'
import { SocialPreview } from '@/components/youtube/SocialPreview'
import { GuestInfo } from '@/components/youtube/GuestInfo'
import { CommentsList } from '@/components/youtube/CommentsList'
import { ShortLinkModal } from '@/components/youtube/ShortLinkModal'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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

const sectionTitle = 'text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2'

export default function VideoDetailPage() {
  const params = useParams()
  const router = useRouter()
  const videoId = params.id as string

  const [video, setVideo] = useState<any>(null)
  const [channel, setChannel] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<string | null>(null)
  const [copiedTags, setCopiedTags] = useState(false)
  const [publishingVariant, setPublishingVariant] = useState<number | null>(null)
  const [descEdit, setDescEdit] = useState<string | null>(null)
  const [descSaving, setDescSaving] = useState(false)
  const [descSaved, setDescSaved] = useState(false)
  const [publishedVariants, setPublishedVariants] = useState<Set<number>>(new Set())
  const [copiedTimecodes, setCopiedTimecodes] = useState(false)
  const [regenTimecodes, setRegenTimecodes] = useState(false)
  const [guestLinks, setGuestLinks] = useState<string | null>(null)
  const [guestLinksSaved, setGuestLinksSaved] = useState(false)
  const [shortLinkOpen, setShortLinkOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const descTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function deleteFromSystem() {
    if (deleting) return
    if (!confirm('Удалить это видео из ContentOS? Все связанные задания, правки и драфты будут удалены. YouTube это не затронет.')) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/youtube/${videoId}`, { method: 'DELETE' })
      if (res.ok) {
        router.push('/youtube')
        return
      }
      const data = await res.json().catch(() => ({}))
      alert('Ошибка: ' + (data.error ?? res.status))
    } finally {
      setDeleting(false)
    }
  }

  const loadVideo = useCallback(async () => {
    try {
      const res = await fetch(`/api/youtube/${videoId}`)
      if (!res.ok) return null
      const data = await res.json()
      if (data?.id) {
        setVideo(data)
        if (data.channel_id && !channel) {
          const chRes = await fetch(`/api/channels/${data.channel_id}`)
          if (chRes.ok) {
            const chData = await chRes.json()
            if (chData?.id) setChannel(chData)
          }
        }
        return data
      }
      return null
    } catch (err) {
      console.error('Load failed:', err)
      return null
    } finally {
      setLoading(false)
    }
  }, [videoId])

  useEffect(() => { loadVideo() }, [loadVideo])

  // Poll while processing (status or thumbnail generation)
  useEffect(() => {
    if (!video) return
    const statusActive = ['transcribing', 'producing', 'generating', 'thumbnail', 'publishing'].includes(video.status)
    const thumbActive = !!video.producer_output?.thumbnail_generating
    if (!statusActive && !thumbActive) { setProcessing(null); return }
    const interval = setInterval(loadVideo, 5000)
    return () => clearInterval(interval)
  }, [video?.status, video?.producer_output?.thumbnail_generating, loadVideo])

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

  const publishVariant = async (variantIndex: number, title: string, thumbnailUrl: string) => {
    setPublishingVariant(variantIndex)
    setProcessing('Публикация')
    try {
      const res = await fetch('/api/process/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, title, thumbnailUrl }),
      })
      if (res.ok) {
        setPublishedVariants(prev => new Set(prev).add(variantIndex))
      }
      setTimeout(loadVideo, 3000)
    } catch {
      setProcessing(null)
    } finally {
      setPublishingVariant(null)
    }
  }

  const patchVideo = async (data: Record<string, any>) => {
    await fetch(`/api/youtube/${videoId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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

  // Compose full description: AI text + timecodes + channel_links + hashtags
  function composeDescription(): string {
    const po = video?.producer_output
    const rules = channel?.rules
    // Always use po.description as base (no timecodes), never generated_description
    const aiDesc = po?.description ?? ''
    const guestLinks = video?.guest_links ?? po?.guest_info?.links ?? ''
    const timecodes = po?.timecodes ?? []
    const channelLinks = rules?.channel_links ?? ''
    // Use AI-generated hashtags first, fall back to channel fixed hashtags
    const hashtags = (po?.hashtags?.length ? po.hashtags : rules?.hashtags_fixed ?? []).join(' ')

    const parts: string[] = [aiDesc]
    if (guestLinks.trim()) parts.push(`Ссылки:\n${guestLinks.trim()}`)
    if (timecodes.length > 0) {
      const tc = timecodes.map((t: any) => `${t.time} — ${t.label}`).join('\n')
      parts.push(`Тайм-коды:\n${tc}`)
    }
    if (channelLinks.trim()) parts.push(channelLinks.trim())
    if (hashtags.trim()) parts.push(hashtags.trim())
    return parts.join('\n\n')
  }

  const saveDescDebounced = useCallback((text: string) => {
    if (descTimerRef.current) clearTimeout(descTimerRef.current)
    descTimerRef.current = setTimeout(async () => {
      setDescSaving(true)
      await fetch(`/api/youtube/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generated_description: text }),
      })
      setDescSaving(false)
      setDescSaved(true)
      setTimeout(() => setDescSaved(false), 2000)
    }, 1500)
  }, [videoId])

  if (loading) {
    return <div className="min-h-screen bg-background text-foreground flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
  }
  if (!video) {
    return <div className="min-h-screen bg-background text-foreground flex items-center justify-center"><div className="text-muted-foreground">Видео не найдено</div></div>
  }

  const po = video.producer_output
  const sv = video.selected_variants ?? {}
  const isProcessing = ['transcribing', 'producing', 'generating', 'thumbnail', 'publishing'].includes(video.status)
  const canProduce = video.status === 'pending' || video.status === 'error' || video.status === 'review'
  const canPublish = (video.status === 'review' || video.status === 'done') && video.is_approved

  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      <div className="max-w-7xl mx-auto px-6 py-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="secondary" size="icon-sm" onClick={() => router.push('/youtube')}>
            <ArrowLeft />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-medium text-foreground truncate">{video.current_title}</h1>
            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(video.duration_seconds)}</span>
              <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatCount(video.view_count)}</span>
              <span className="flex items-center gap-1"><ThumbsUp className="w-3 h-3" />{formatCount(video.like_count)}</span>
              {video.ai_score != null && (
                <span className="flex items-center gap-1 text-purple-500"><Sparkles className="w-3 h-3" />{video.ai_score}</span>
              )}
            </div>
          </div>
          <Button variant="secondary" size="icon-sm" onClick={() => setShortLinkOpen(true)} title="Deep link">
            <LinkIcon />
          </Button>
          <Button variant="secondary" size="icon-sm" asChild>
            <a href={`https://youtube.com/watch?v=${video.yt_video_id}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
            </a>
          </Button>
          <Button
            variant="secondary"
            size="icon-sm"
            onClick={deleteFromSystem}
            disabled={deleting}
            title="Удалить из системы"
            className="hover:bg-destructive/10 hover:text-destructive"
          >
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        </div>

        {/* Status */}
        <Card className="mb-6 p-3">
          <StatusStepper status={video.status} />
          {video.status === 'error' && video.error_message && !video.error_message.startsWith('progress:') && (
            <div className="flex items-center justify-between mt-2 px-2">
              <p className="text-xs text-destructive">{video.error_message}</p>
              <Button
                variant="ghost"
                size="sm"
                className="bg-destructive/10 text-destructive hover:bg-destructive/20"
                onClick={() => patchVideo({
                  status: po ? 'review' : 'pending',
                  error_message: null,
                })}
              >
                Сбросить
              </Button>
            </div>
          )}
          {isProcessing && (
            <div className="flex items-center gap-2 mt-2 px-2 text-xs text-purple-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {video.error_message?.startsWith('progress:')
                ? video.error_message.replace('progress:', '')
                : processing || 'Обработка...'}
            </div>
          )}
        </Card>

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
                <Card className="p-4">
                  <h3 className={sectionTitle}><User className="w-4 h-4" /> Гость</h3>
                  <GuestInfo guest={po.guest_info} onUpdate={(g) => patchVideo({ producer_output: { ...po, guest_info: g } })} />
                  {/* Guest Links */}
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">Ссылки на гостя</label>
                      {guestLinksSaved && <span className="text-[10px] text-emerald-500">Сохранено</span>}
                    </div>
                    <textarea
                      className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      rows={3}
                      placeholder={'— https://t.me/guest\n— https://instagram.com/guest'}
                      value={guestLinks ?? video.guest_links ?? ''}
                      onChange={e => setGuestLinks(e.target.value)}
                      onBlur={async () => {
                        const val = guestLinks ?? ''
                        await patchVideo({ guest_links: val })
                        setGuestLinks(null)
                        setGuestLinksSaved(true)
                        setTimeout(() => setGuestLinksSaved(false), 2000)
                      }}
                    />
                  </div>
                </Card>

                {/* Titles */}
                <Card className="p-4">
                  <h3 className={sectionTitle}>Заголовок</h3>
                  <VariantSelector
                    variants={po.title_variants}
                    selectedIndex={sv.title_index}
                    editedTitle={video.generated_title}
                    onSelect={selectTitle}
                    onTitleEdit={async (text) => {
                      await patchVideo({ generated_title: text })
                    }}
                  />
                </Card>

                {/* Description */}
                <Card className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-medium text-muted-foreground">Описание</h3>
                    <div className="flex items-center gap-2">
                      {descSaving && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /></span>}
                      {descSaved && <span className="text-xs text-emerald-500 flex items-center gap-1"><Check className="w-3 h-3" /> Сохранено</span>}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const full = composeDescription()
                          setDescEdit(full)
                          saveDescDebounced(full)
                        }}
                      >
                        <FileText />
                        Собрать
                      </Button>
                    </div>
                  </div>
                  <textarea
                    className="w-full bg-background border border-border rounded-lg p-3 text-xs text-foreground leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-ring min-h-[200px]"
                    value={descEdit ?? video.generated_description ?? po.description ?? ''}
                    onChange={e => {
                      setDescEdit(e.target.value)
                      saveDescDebounced(e.target.value)
                    }}
                    rows={12}
                  />
                  <div className="flex items-center justify-between mt-2 px-1">
                    <span className="text-[10px] text-muted-foreground/60">{(descEdit ?? video.generated_description ?? po.description ?? '').length} / 5000 символов</span>
                  </div>
                </Card>

                {/* Tags */}
                {po.tags?.length > 0 && (
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Tag className="w-4 h-4" /> Теги ({po.tags.length})</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const text = po.tags.map((t: string) => t.replace(/^#/, '')).join(', ')
                          navigator.clipboard.writeText(text)
                          setCopiedTags(true)
                          setTimeout(() => setCopiedTags(false), 2000)
                        }}
                      >
                        {copiedTags ? <Check className="text-emerald-500" /> : <Copy />}
                        {copiedTags ? 'Скопировано' : 'Копировать'}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {po.tags.map((tag: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-accent-surface rounded text-xs text-muted-foreground">{tag}</span>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Timecodes */}
                {po.timecodes?.length > 0 && (
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2"><Clock className="w-4 h-4" /> Тайм-коды ({po.timecodes.length})</h3>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (regenTimecodes) return
                            setRegenTimecodes(true)
                            try {
                              const res = await fetch('/api/youtube/regenerate-timecodes', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ videoId }),
                              })
                              if (!res.ok) {
                                const data = await res.json().catch(() => ({}))
                                alert('Ошибка: ' + (data.error ?? res.status))
                                return
                              }
                              // Worker takes ~20s — poll until timecodes actually change.
                              const before = JSON.stringify(po?.timecodes ?? [])
                              const deadline = Date.now() + 60_000
                              while (Date.now() < deadline) {
                                await new Promise(r => setTimeout(r, 2000))
                                const v = await loadVideo()
                                const after = JSON.stringify(v?.producer_output?.timecodes ?? [])
                                if (after && after !== before) break
                              }
                            } finally {
                              setRegenTimecodes(false)
                            }
                          }}
                          disabled={regenTimecodes}
                          title="Перегенерировать таймкоды"
                        >
                          {regenTimecodes
                            ? <Loader2 className="animate-spin" />
                            : <Sparkles />}
                          {regenTimecodes ? 'Генерация...' : 'Перегенерировать'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const text = po.timecodes.map((tc: any) => `${tc.time} — ${tc.label}`).join('\n')
                            navigator.clipboard.writeText(text)
                            setCopiedTimecodes(true)
                            setTimeout(() => setCopiedTimecodes(false), 2000)
                          }}
                        >
                          {copiedTimecodes ? <Check className="text-emerald-500" /> : <Copy />}
                          {copiedTimecodes ? 'Скопировано' : 'Копировать'}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {po.timecodes.map((tc: any, i: number) => (
                        <div key={i} className="flex gap-3 text-xs">
                          <span className="text-purple-500 font-mono w-14 shrink-0">{tc.time}</span>
                          <span className="text-muted-foreground">{tc.label}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Clips & Shorts */}
                <Card className="p-4">
                  <h3 className={sectionTitle}><Scissors className="w-4 h-4" /> Контент для нарезки</h3>
                  <ClipList
                    clips={po.clip_suggestions ?? []}
                    shorts={po.short_suggestions ?? []}
                    selectedClips={sv.clips_selected ?? []}
                    selectedShorts={sv.shorts_selected ?? []}
                    onToggleClip={toggleClip}
                    onToggleShort={toggleShort}
                  />
                </Card>

                {/* Social Previews */}
                {po.social_drafts?.length > 0 && (
                  <Card className="p-4">
                    <h3 className={sectionTitle}><MessageSquare className="w-4 h-4" /> Анонсы</h3>
                    <SocialPreview drafts={po.social_drafts} />
                  </Card>
                )}

                {/* Create Carousel from Video */}
                {video.transcript && (
                  <Card className="p-4">
                    <h3 className={sectionTitle}><GalleryHorizontalEnd className="w-4 h-4" /> Карусель</h3>
                    <p className="text-xs text-muted-foreground mb-3">Создай Instagram-карусель из ключевых идей этого видео</p>
                    <Button
                      variant="outline"
                      onClick={() => router.push(`/carousels/new?videoId=${video.id}&topic=${encodeURIComponent(video.generated_title || video.current_title || '')}`)}
                    >
                      <GalleryHorizontalEnd />
                      Создать карусель из видео
                    </Button>
                  </Card>
                )}
              </>
            )}

            {/* Comments */}
            <Card className="p-4">
              <CommentsList videoId={video.id} />
            </Card>

            {/* Transcript */}
            <Card className="p-4">
              <h3 className={sectionTitle}><FileText className="w-4 h-4" /> Транскрипт</h3>
              <TranscriptViewer videoTitle={video.current_title} chunks={video.transcript_chunks} transcript={video.transcript} />
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-4">

            {/* Actions */}
            <Card className="p-4 space-y-2 sticky top-6 z-30">
              <h3 className="text-sm font-medium text-muted-foreground mb-3">Действия</h3>

              {po ? (
                <>
                  <button
                    onClick={runProduce}
                    disabled={isProcessing}
                    className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 transition-colors disabled:opacity-30"
                  >
                    {isProcessing ? <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> : null}
                    Перегенерировать
                  </button>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push(`/clips/${videoId}`)}
                  >
                    <Scissors /> Создать клипы
                  </Button>

                  <div className="border-t border-border pt-2 mt-2">
                    <button
                      onClick={() => patchVideo({ is_approved: !video.is_approved })}
                      disabled={video.status !== 'review' || isProcessing}
                      className={`w-full py-2.5 px-4 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 ${
                        video.is_approved ? 'bg-emerald-500/20 text-emerald-500' : 'bg-accent-surface text-muted-foreground hover:bg-accent-surface/80'
                      }`}
                    >
                      {video.is_approved ? <><Check className="w-4 h-4 inline mr-2" />Одобрено</> : 'Одобрить'}
                    </button>
                  </div>

                  {/* Publish */}
                  {canPublish && (() => {
                    const thumb = video.thumbnail_url ?? ''
                    const title = video.generated_title ?? po?.title_variants?.[0]?.text ?? ''
                    const published = publishedVariants.has(0)
                    return (
                      <div className="mt-2 border-t border-border pt-2">
                        <p className="text-[10px] text-muted-foreground/60 px-1 mb-1.5">{video.is_published_back ? 'Обновить на YouTube' : 'Публикация на YouTube'}</p>
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-accent-surface/50 border border-border">
                          {thumb && <img src={thumb} alt="" className="w-12 h-7 rounded object-cover flex-shrink-0" />}
                          <p className="flex-1 min-w-0 text-[11px] text-foreground truncate">{title}</p>
                          <button
                            onClick={() => publishVariant(0, title, thumb)}
                            disabled={isProcessing || published}
                            className={`px-2 py-1 rounded text-[10px] transition-colors whitespace-nowrap flex-shrink-0 ${
                              published
                                ? 'bg-emerald-500/20 text-emerald-500'
                                : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-30'
                            }`}
                          >
                            {publishingVariant === 0
                              ? <Loader2 className="w-3 h-3 animate-spin inline" />
                              : published
                                ? <Check className="w-3 h-3 inline" />
                                : video.is_published_back ? 'Обновить' : 'Загрузить'}
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                </>
              ) : (
                <>
                  <button onClick={() => runProcess('transcribe', 'Транскрипция')} disabled={!(video.status === 'pending' || video.status === 'error') || isProcessing}
                    className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-sky-500/10 text-sky-500 hover:bg-sky-500/20 transition-colors disabled:opacity-30">
                    Транскрибировать
                  </button>
                  <button onClick={() => runProcess('generate', 'AI генерация')} disabled={!((video.status === 'generating' || video.status === 'error') && video.transcript) || isProcessing}
                    className="w-full py-2.5 px-4 rounded-lg text-sm font-medium bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 transition-colors disabled:opacity-30">
                    Сгенерировать
                  </button>
                </>
              )}
            </Card>

            {/* Thumbnail Studio */}
            {po && (
              <Card className="p-4">
                <ThumbnailStudio
                  videoId={video.id}
                  channelId={video.channel_id}
                  textVariants={po.thumbnail_spec?.text_overlay_variants ?? []}
                  currentThumbnail={video.current_thumbnail}
                  savedUrlsByTemplate={po.thumbnail_urls_by_template}
                  savedPhotos={po.saved_photos}
                  savedReference={po.saved_reference}
                  thumbnailGenerating={po.thumbnail_generating}
                  contentType={video.content_type ?? null}
                  onSelect={selectThumbnailByUrl}
                />
              </Card>
            )}

            {/* Thumbnails (legacy gallery) */}
            {!po && video.thumbnail_url && (
              <Card className="p-4">
                <h3 className={sectionTitle}><Image className="w-4 h-4" /> Обложки</h3>
                <ThumbnailGallery
                  thumbnailUrls={[video.thumbnail_url]}
                  currentThumbnail={video.current_thumbnail}
                  selectedIndex={0}
                  onSelect={selectThumbnailByIndex}
                />
              </Card>
            )}

            {/* AI Score */}
            {po?.ai_score != null && (
              <Card className="p-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Score</h3>
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-bold text-purple-500 tabular-nums">{po.ai_score}</div>
                  <div className="flex-1">
                    <div className="h-2 bg-accent-surface rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${po.ai_score}%` }} />
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* Summary */}
            {po?.content_summary && (
              <Card className="p-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-2">Резюме</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{po.content_summary}</p>
              </Card>
            )}
          </div>
        </div>
      </div>

      {shortLinkOpen && (
        <ShortLinkModal videoId={videoId} onClose={() => setShortLinkOpen(false)} />
      )}
    </div>
  )
}
