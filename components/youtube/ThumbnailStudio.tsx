'use client'

import { useState, useRef, useEffect, DragEvent } from 'react'
import { Wand2, Loader2, X, Plus, Check, Image as ImageIcon, Download, Eye, ChevronDown } from 'lucide-react'

type Template = 'solo' | 'duo' | 'custom'
type ContentType = 'podcast' | 'video' | 'short'

interface Props {
  videoId: string
  channelId?: string
  textVariants: string[]
  currentThumbnail?: string
  savedUrlsByTemplate?: Record<string, string[]>
  savedPhotos?: string[]
  savedReference?: string
  thumbnailGenerating?: string | null
  contentType?: ContentType | null
  onSelect: (url: string) => void
}

interface PromptPreview {
  contentType: string
  template: string
  textLine1: string
  textLine2: string
  facePhotos: number
  styleReference: boolean
  channelStylePrompt: string | null
  refinement: string | null
  sampleEmotion: string
  sampleFullPrompt: string
  imageUrls: string[]
  variants: string[]
}

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  podcast: 'Подкаст',
  video: 'Видео',
  short: 'Короткое',
}

const hiddenInput: React.CSSProperties = { position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }

function apiUrl(path: string): string {
  if (typeof window !== 'undefined') return `${window.location.origin}${path}`
  return path
}

async function downloadImage(url: string, filename: string) {
  try {
    const res = await fetch(url)
    const blob = await res.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(objectUrl)
  } catch {
    window.open(url, '_blank')
  }
}

function SoloIcon() {
  return (
    <svg viewBox="0 0 64 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="64" height="36" rx="2" fill="#0f1a10"/>
      <rect x="4" y="10" width="22" height="3" rx="1" fill="white" opacity="0.9"/>
      <rect x="4" y="15" width="18" height="3" rx="1" fill="#4CAF50" opacity="0.9"/>
      <ellipse cx="48" cy="12" rx="7" ry="8" fill="#2d4a2f"/>
      <path d="M34 36 Q41 20 48 20 Q55 20 62 36Z" fill="#2d4a2f"/>
    </svg>
  )
}

function DuoIcon() {
  return (
    <svg viewBox="0 0 64 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="64" height="36" rx="2" fill="#0f1a10"/>
      <ellipse cx="12" cy="11" rx="6" ry="7" fill="#2d4a2f"/>
      <path d="M2 36 Q7 20 12 20 Q17 20 22 36Z" fill="#2d4a2f"/>
      <rect x="22" y="12" width="20" height="3" rx="1" fill="white" opacity="0.9"/>
      <rect x="22" y="17" width="16" height="3" rx="1" fill="#4CAF50" opacity="0.9"/>
      <ellipse cx="52" cy="11" rx="6" ry="7" fill="#2d4a2f"/>
      <path d="M42 36 Q47 20 52 20 Q57 20 62 36Z" fill="#2d4a2f"/>
    </svg>
  )
}

function CustomIcon() {
  return (
    <svg viewBox="0 0 64 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <rect width="64" height="36" rx="2" fill="#0f1a10"/>
      <rect x="2" y="2" width="60" height="32" rx="2" stroke="#4b5563" strokeWidth="1.5" strokeDasharray="4 2"/>
      <path d="M28 14 L32 10 L36 14" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M32 10 L32 22" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M24 26 L28 22 L34 28 L38 24 L42 28" stroke="#6b7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

const TEMPLATES: { id: Template; label: string; icon: React.ReactNode }[] = [
  { id: 'solo', label: 'Гость', icon: <SoloIcon /> },
  { id: 'duo',  label: 'Я + Гость', icon: <DuoIcon /> },
  { id: 'custom', label: 'Свой реф', icon: <CustomIcon /> },
]

export function ThumbnailStudio({ videoId, channelId, textVariants, currentThumbnail, savedUrlsByTemplate, savedPhotos, savedReference, thumbnailGenerating, contentType, onSelect }: Props) {
  const [template, setTemplate] = useState<Template>('solo')
  const [activeContentType, setActiveContentType] = useState<ContentType>(contentType ?? 'podcast')
  const [photos, setPhotos] = useState<{ file?: File; preview: string }[]>([])
  const [reference, setReference] = useState<{ file?: File; preview: string } | null>(null)
  const [selectedText, setSelectedText] = useState(textVariants[0] ?? '')
  const [customText, setCustomText] = useState('')
  const [refinement, setRefinement] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resultsByTemplate, setResultsByTemplate] = useState<Record<Template, { url: string; model: string }[]>>({
    solo: [], duo: [], custom: [],
  })
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  // B-03 preview panel state
  const [preview, setPreview] = useState<PromptPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    if (contentType) setActiveContentType(contentType)
  }, [contentType])

  const photoRef = useRef<HTMLInputElement>(null)
  const refRef = useRef<HTMLInputElement>(null)

  // Generating state comes from DB (survives navigation)
  const isGenerating = !!thumbnailGenerating

  useEffect(() => {
    if (savedPhotos?.length && photos.length === 0) {
      setPhotos(savedPhotos.map(url => ({ preview: url })))
    }
    if (savedReference && !reference) {
      setReference({ preview: savedReference })
    }
  }, [savedPhotos, savedReference])

  useEffect(() => {
    if (!savedUrlsByTemplate) return
    setResultsByTemplate({
      solo:   (savedUrlsByTemplate.solo   ?? []).map(u => ({ url: u, model: '' })),
      duo:    (savedUrlsByTemplate.duo    ?? []).map(u => ({ url: u, model: '' })),
      custom: (savedUrlsByTemplate.custom ?? []).map(u => ({ url: u, model: '' })),
    })
  }, [savedUrlsByTemplate])

  const addPhotos = (files: FileList | null) => {
    if (!files) return
    const added = Array.from(files).slice(0, 3 - photos.length).map(f => ({
      file: f, preview: URL.createObjectURL(f),
    }))
    setPhotos(prev => [...prev, ...added].slice(0, 3))
  }

  const removePhoto = (i: number) => {
    setPhotos(prev => {
      if (prev[i].file) URL.revokeObjectURL(prev[i].preview)
      return prev.filter((_, idx) => idx !== i)
    })
  }

  const setRef = (f: File) => {
    if (reference?.file) URL.revokeObjectURL(reference.preview)
    setReference({ file: f, preview: URL.createObjectURL(f) })
  }

  const removeRef = () => {
    if (reference?.file) URL.revokeObjectURL(reference.preview)
    setReference(null)
  }

  const activeText = customText || selectedText

  const generate = async () => {
    if (!activeText || isGenerating || submitting) return
    setSubmitting(true)
    setError(null)

    try {
      // Upload new files first
      const existingPhotoUrls = photos.filter(p => !p.file).map(p => p.preview)
      const newPhotoFiles = photos.filter(p => p.file).map(p => p.file!)
      const existingRefUrl = (!reference?.file && reference?.preview) ? reference.preview : ''
      const newRefFile = reference?.file

      let photoUrls: string[] = [...existingPhotoUrls]
      let refUrl = existingRefUrl

      const allNewFiles = [...newPhotoFiles, ...(newRefFile ? [newRefFile] : [])]
      if (allNewFiles.length > 0) {
        const fd = new FormData()
        fd.set('videoId', videoId)
        allNewFiles.forEach((f, i) => fd.set(`file${i}`, f))
        const upRes = await fetch(apiUrl('/api/thumbnail/upload'), { method: 'POST', body: fd })
        const upData = await upRes.json()
        if (upData.urls) {
          if (newRefFile) {
            refUrl = upData.urls[upData.urls.length - 1]
            photoUrls = [...photoUrls, ...upData.urls.slice(0, -1)]
          } else {
            photoUrls = [...photoUrls, ...upData.urls]
          }
        }
      }

      // Save assets
      if (photoUrls.length > 0 || refUrl) {
        fetch(apiUrl('/api/thumbnail/save-assets'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId, photos: photoUrls, reference: refUrl || undefined }),
        }).catch(() => {})
      }

      // Fire-and-forget: start generation on server
      // Server marks thumbnail_generating in DB, page polling picks it up
      const res = await fetch(apiUrl('/api/thumbnail/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          channelId,
          photos: photoUrls,
          text: activeText,
          template,
          referenceUrl: refUrl || undefined,
          refinement: refinement || undefined,
          contentType: activeContentType,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || `Ошибка ${res.status}`)
      } else {
        setRefinement('')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  // B-03: fetch the final prompt + image URL list that will be sent to fal.ai,
  // WITHOUT actually running a generation. Uses dryRun=true on the same endpoint.
  // Note: only works with already-uploaded assets (photos/reference URLs) —
  // new files are uploaded only when user clicks Generate.
  async function loadPreview(): Promise<void> {
    if (!activeText || previewLoading) return
    setPreviewLoading(true)
    setError(null)
    try {
      const photoUrls = photos.filter(p => !p.file).map(p => p.preview)
      const refUrl = (!reference?.file && reference?.preview) ? reference.preview : undefined
      const res = await fetch(apiUrl('/api/thumbnail/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          channelId,
          photos: photoUrls,
          text: activeText,
          template,
          referenceUrl: refUrl,
          refinement: refinement || undefined,
          contentType: activeContentType,
          dryRun: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || `Ошибка превью ${res.status}`)
        return
      }
      const data = await res.json()
      setPreview(data)
      setPreviewOpen(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setPreviewLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <ImageIcon className="w-4 h-4" /> Обложка
        </h3>
        {isGenerating && (
          <span className="flex items-center gap-1.5 text-xs text-purple-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Генерация...
          </span>
        )}
      </div>

      {/* Results */}
      {resultsByTemplate[template].length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {resultsByTemplate[template].map((r, i) => (
            <button
              key={r.url + i}
              onClick={() => { setSelectedUrl(r.url); onSelect(r.url) }}
              className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                selectedUrl === r.url ? 'border-emerald-500 ring-1 ring-emerald-500/30' : 'border-border hover:border-accent/30'
              }`}
            >
              <img
                src={r.url + (r.url.includes('?') ? '&' : '?') + 'v=1'}
                alt=""
                className="w-full aspect-video object-cover"
                loading="eager"
                onError={e => {
                  // Exponential backoff retry — Supabase Storage CDN warmup can
                  // take longer for larger images (duo template vs solo), and the
                  // single 2s retry wasn't enough. Retries at 1.5s, 4s, 9s.
                  const img = e.target as HTMLImageElement
                  const attempt = Number(img.dataset.attempt ?? '0') + 1
                  img.dataset.attempt = String(attempt)
                  const delays = [1500, 4000, 9000]
                  const delay = delays[attempt - 1]
                  if (delay !== undefined) {
                    setTimeout(() => {
                      img.src = r.url + (r.url.includes('?') ? '&' : '?') + 'v=' + Date.now()
                    }, delay)
                  }
                }}
              />
              {r.model && <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded text-[10px] text-muted-foreground">{r.model}</span>}
              {selectedUrl === r.url && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              <button
                onClick={e => { e.stopPropagation(); downloadImage(r.url, `thumbnail_${i + 1}.jpg`) }}
                className="absolute top-1.5 left-1.5 w-6 h-6 bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/90"
                title="Скачать"
              >
                <Download className="w-3 h-3 text-white" />
              </button>
            </button>
          ))}
        </div>
      )}

      {/* Generating placeholder */}
      {isGenerating && resultsByTemplate[template].length === 0 && (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="aspect-video rounded-lg bg-accent-surface border border-border flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-purple-400/40" />
            </div>
          ))}
        </div>
      )}

      {/* Input panel */}
      <div
        className={`rounded-xl border p-3 space-y-3 transition-colors ${dragOver ? 'border-purple-500/50 bg-purple-500/5' : 'border-border bg-card'}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e: DragEvent) => { e.preventDefault(); setDragOver(false); addPhotos(e.dataTransfer.files) }}
      >
        {/* Content type selector (B-04) — picks per-type style preset from channel.rules */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Тип контента</span>
          <div className="flex gap-1">
            {(Object.keys(CONTENT_TYPE_LABELS) as ContentType[]).map(ct => (
              <button
                key={ct}
                onClick={() => setActiveContentType(ct)}
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                  activeContentType === ct
                    ? 'bg-accent text-white'
                    : 'bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                {CONTENT_TYPE_LABELS[ct]}
              </button>
            ))}
          </div>
        </div>

        {/* Template selector */}
        <div className="flex gap-2">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              onClick={() => setTemplate(t.id)}
              className={`flex-1 flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-all ${
                template === t.id
                  ? 'border-purple-500/60 bg-purple-500/10'
                  : 'border-border bg-background hover:border-border/80'
              }`}
            >
              <div className="w-full aspect-video rounded overflow-hidden">{t.icon}</div>
              <span className={`text-[10px] font-medium ${template === t.id ? 'text-purple-300' : 'text-muted-foreground/60'}`}>{t.label}</span>
            </button>
          ))}
        </div>

        {/* Photos + ref row */}
        <div className="flex gap-2 items-center flex-wrap">
          {photos.map((p, i) => (
            <div key={i} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-border flex-shrink-0">
              <img src={p.preview} alt="" className="w-full h-full object-cover" />
              <button onClick={() => removePhoto(i)} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ))}
          {reference && (
            <div className="relative group w-14 h-14 rounded-lg overflow-hidden border border-purple-500/40 flex-shrink-0">
              <img src={reference.preview} alt="" className="w-full h-full object-cover" />
              <span className="absolute bottom-0 inset-x-0 bg-purple-600/90 text-[7px] text-center text-white leading-tight py-px">REF</span>
              <button onClick={removeRef} className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          )}
          {photos.length < 3 && (
            <button onClick={() => photoRef.current?.click()} className="w-14 h-14 rounded-lg border border-dashed border-border flex flex-col items-center justify-center text-muted-foreground/60 hover:text-muted-foreground hover:border-muted transition-colors flex-shrink-0 gap-0.5">
              <Plus className="w-3.5 h-3.5" />
              <span className="text-[8px] leading-none">Фото</span>
            </button>
          )}
          {!reference && (
            <button onClick={() => refRef.current?.click()} className="w-14 h-14 rounded-lg border border-dashed border-purple-500/20 flex flex-col items-center justify-center text-purple-400/30 hover:text-purple-400/50 hover:border-purple-500/30 transition-colors flex-shrink-0 gap-0.5">
              <Plus className="w-3.5 h-3.5" />
              <span className="text-[8px] leading-none">Стиль</span>
            </button>
          )}
          <input ref={photoRef} type="file" accept="image/*" multiple style={hiddenInput} onChange={e => { addPhotos(e.target.files); e.target.value = '' }} />
          <input ref={refRef} type="file" accept="image/*" style={hiddenInput} onChange={e => { if (e.target.files?.[0]) setRef(e.target.files[0]); e.target.value = '' }} />
        </div>

        {/* Text chips */}
        <div className="flex flex-wrap gap-1.5">
          {textVariants.map((t, i) => (
            <button
              key={i}
              onClick={() => { setSelectedText(t); setCustomText('') }}
              className={`px-2.5 py-1 rounded-full text-[11px] transition-colors ${
                selectedText === t && !customText
                  ? 'bg-accent/15 text-accent border border-accent/30'
                  : 'bg-card text-muted-foreground border border-border hover:text-foreground'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Input + button */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            placeholder="Свой текст..."
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-accent/40"
            onKeyDown={e => e.key === 'Enter' && generate()}
          />
          <button
            onClick={generate}
            disabled={isGenerating || submitting || !activeText}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white text-sm font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0"
          >
            {(isGenerating || submitting) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            {isGenerating ? 'Генерация...' : submitting ? 'Отправка...' : 'Создать'}
          </button>
        </div>

        {/* Refine */}
        {resultsByTemplate[template].length > 0 && !isGenerating && (
          <input
            type="text"
            value={refinement}
            onChange={e => setRefinement(e.target.value)}
            placeholder="Доработать: темнее, крупнее текст..."
            className="w-full px-3 py-1.5 rounded-lg bg-card border border-border text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-accent/40"
            onKeyDown={e => e.key === 'Enter' && refinement && generate()}
          />
        )}

        {/* B-03: prompt preview toggle */}
        <button
          type="button"
          onClick={() => {
            if (!preview) { void loadPreview() } else { setPreviewOpen(v => !v) }
          }}
          disabled={!activeText || previewLoading}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors disabled:opacity-40"
        >
          {previewLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
          {previewLoading ? 'Собираем...' : preview && previewOpen ? 'Скрыть превью промпта' : 'Показать что уходит в модель'}
          {preview && <ChevronDown className={`w-3 h-3 transition-transform ${previewOpen ? 'rotate-180' : ''}`} />}
        </button>

        {preview && previewOpen && (
          <div className="rounded-lg bg-background/80 border border-border p-3 space-y-2 text-[11px]">
            <div className="grid grid-cols-2 gap-2 text-muted-foreground/60">
              <div><span className="text-muted-foreground">Тип:</span> <span className="text-foreground">{CONTENT_TYPE_LABELS[(preview.contentType as ContentType)] ?? preview.contentType}</span></div>
              <div><span className="text-muted-foreground">Шаблон:</span> <span className="text-foreground">{preview.template}</span></div>
              <div><span className="text-muted-foreground">Фото лиц:</span> <span className="text-foreground">{preview.facePhotos}</span></div>
              <div><span className="text-muted-foreground">Стилевой реф:</span> <span className={preview.styleReference ? 'text-emerald-400' : 'text-muted-foreground/60'}>{preview.styleReference ? 'да' : 'нет'}</span></div>
              <div><span className="text-muted-foreground">Строка 1:</span> <span className="text-foreground">{preview.textLine1 || '—'}</span></div>
              <div><span className="text-muted-foreground">Строка 2:</span> <span className="text-foreground">{preview.textLine2 || '—'}</span></div>
            </div>
            {preview.channelStylePrompt && (
              <div className="text-muted-foreground/60">
                <span className="text-muted-foreground">Стиль канала:</span>{' '}
                <span className="text-foreground">{preview.channelStylePrompt}</span>
              </div>
            )}
            {preview.refinement && (
              <div className="text-muted-foreground/60">
                <span className="text-muted-foreground">Замечание:</span>{' '}
                <span className="text-foreground">{preview.refinement}</span>
              </div>
            )}
            {preview.imageUrls.length > 0 && (
              <div className="text-muted-foreground/60">
                <span className="text-muted-foreground">В fal пойдут {preview.imageUrls.length} изображений:</span>
                <div className="mt-1 flex gap-1 flex-wrap">
                  {preview.imageUrls.map((u, i) => (
                    <img key={i} src={u} alt="" className="w-10 h-10 rounded object-cover border border-border" />
                  ))}
                </div>
              </div>
            )}
            <details className="text-muted-foreground/60">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Полный промпт (образец — вариант «{preview.sampleEmotion}»)
              </summary>
              <pre className="mt-2 p-2 rounded bg-black/20 text-[10px] leading-relaxed text-foreground whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                {preview.sampleFullPrompt}
              </pre>
            </details>
            <p className="text-muted-foreground/60 text-[10px]">
              Превью работает только с уже загруженными референсами. Новые файлы подтянутся при нажатии «Создать».
            </p>
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  )
}
