'use client'

import { useState, useRef, DragEvent } from 'react'
import { Wand2, Loader2, X, Plus, RefreshCw, Check, ImageIcon } from 'lucide-react'

interface ThumbnailStudioProps {
  videoId: string
  textVariants: string[]
  currentThumbnail?: string
  generatedUrls?: string[]
  onSelect: (url: string) => void
}

export function ThumbnailStudio({
  videoId,
  textVariants,
  currentThumbnail,
  generatedUrls: initialUrls,
  onSelect,
}: ThumbnailStudioProps) {
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([])
  const [reference, setReference] = useState<{ file: File; preview: string } | null>(null)
  const [selectedText, setSelectedText] = useState(textVariants[0] ?? '')
  const [customText, setCustomText] = useState('')
  const [refinement, setRefinement] = useState('')
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState<{ url: string; model: string }[]>(
    (initialUrls ?? []).map((u, i) => ({ url: u, model: '' }))
  )
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const refFileRef = useRef<HTMLInputElement>(null)

  const addPhotos = (files: FileList | null) => {
    if (!files) return
    const added = Array.from(files).slice(0, 3 - photos.length).map(f => ({
      file: f, preview: URL.createObjectURL(f),
    }))
    setPhotos(prev => [...prev, ...added].slice(0, 3))
  }

  const dropHandler = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addPhotos(e.dataTransfer.files)
  }

  const removePhoto = (i: number) => {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[i].preview)
      return prev.filter((_, idx) => idx !== i)
    })
  }

  const activeText = customText || selectedText

  const generate = async () => {
    if (!activeText) return
    setGenerating(true)
    setError(null)

    try {
      // Upload photos
      let photoUrls: string[] = []
      let refUrl = ''

      if (photos.length > 0 || reference) {
        const fd = new FormData()
        fd.set('videoId', videoId)
        photos.forEach((p, i) => fd.set(`file${i}`, p.file))
        if (reference) fd.set(`file${photos.length}`, reference.file)

        const upRes = await fetch('/api/thumbnail/upload', { method: 'POST', body: fd })
        const upData = await upRes.json()
        if (upData.urls) {
          if (reference) {
            refUrl = upData.urls[upData.urls.length - 1]
            photoUrls = upData.urls.slice(0, -1)
          } else {
            photoUrls = upData.urls
          }
        }
      }

      const res = await fetch('/api/thumbnail/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          photos: photoUrls,
          text: activeText,
          referenceUrl: refUrl || undefined,
          refinement: refinement || undefined,
        }),
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.urls?.length) {
        setResults(data.urls.map((url: string, i: number) => ({
          url, model: data.models?.[i] ?? '',
        })))
        setRefinement('')
      } else {
        setError('AI не вернул изображения')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/60 flex items-center gap-2">
          <ImageIcon className="w-4 h-4" /> Обложка
        </h3>
        {results.length > 0 && (
          <button onClick={generate} disabled={generating} className="text-xs text-white/40 hover:text-white/70 flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Перегенерировать
          </button>
        )}
      </div>

      {/* Results grid */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {results.map((r, i) => (
            <button
              key={r.url}
              onClick={() => { setSelectedUrl(r.url); onSelect(r.url) }}
              className={`relative rounded-lg overflow-hidden border-2 transition-all ${
                selectedUrl === r.url
                  ? 'border-emerald-500 ring-1 ring-emerald-500/30'
                  : 'border-white/[0.06] hover:border-white/20'
              }`}
            >
              <img src={r.url} alt="" className="w-full aspect-video object-cover" />
              {r.model && (
                <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded text-[10px] text-white/60">
                  {r.model}
                </span>
              )}
              {selectedUrl === r.url && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Compact input area */}
      <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-3 space-y-3">

        {/* Photos row */}
        <div
          className={`flex gap-2 items-center ${dragOver ? 'ring-1 ring-purple-500/50 rounded-lg' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={dropHandler}
        >
          {photos.map((p, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
              <img src={p.preview} alt="" className="w-full h-full object-cover" />
              <button onClick={() => removePhoto(i)} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                <X className="w-2.5 h-2.5 text-white" />
              </button>
            </div>
          ))}
          {reference && (
            <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-purple-500/30 flex-shrink-0">
              <img src={reference.preview} alt="" className="w-full h-full object-cover" />
              <span className="absolute bottom-0 inset-x-0 bg-purple-500/80 text-[8px] text-center text-white">REF</span>
              <button onClick={() => { URL.revokeObjectURL(reference.preview); setReference(null) }} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                <X className="w-2.5 h-2.5 text-white" />
              </button>
            </div>
          )}
          {photos.length < 3 && (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-16 h-16 rounded-lg border border-dashed border-white/15 flex flex-col items-center justify-center text-white/25 hover:text-white/40 hover:border-white/25 transition-colors flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="text-[9px]">Фото</span>
            </button>
          )}
          {!reference && (
            <button
              onClick={() => refFileRef.current?.click()}
              className="w-16 h-16 rounded-lg border border-dashed border-purple-500/20 flex flex-col items-center justify-center text-purple-400/40 hover:text-purple-400/60 hover:border-purple-500/30 transition-colors flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="text-[9px]">Стиль</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => addPhotos(e.target.files)} />
          <input ref={refFileRef} type="file" accept="image/*" className="hidden" onChange={e => {
            const f = e.target.files?.[0]
            if (f) {
              if (reference) URL.revokeObjectURL(reference.preview)
              setReference({ file: f, preview: URL.createObjectURL(f) })
            }
          }} />
        </div>

        {/* Text chips */}
        <div className="flex flex-wrap gap-1.5">
          {textVariants.map((t, i) => (
            <button
              key={i}
              onClick={() => { setSelectedText(t); setCustomText('') }}
              className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                selectedText === t && !customText
                  ? 'bg-white/15 text-white border border-white/20'
                  : 'bg-white/[0.04] text-white/50 border border-white/[0.06] hover:text-white/70'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Custom text + generate */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            placeholder="Свой текст на обложку..."
            className="flex-1 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-white/15"
            onKeyDown={e => e.key === 'Enter' && generate()}
          />
          <button
            onClick={generate}
            disabled={generating || !activeText}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white text-sm font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            {generating ? 'AI...' : 'Создать'}
          </button>
        </div>

        {/* Refine input (only after results) */}
        {results.length > 0 && (
          <div className="flex gap-2">
            <input
              type="text"
              value={refinement}
              onChange={e => setRefinement(e.target.value)}
              placeholder="Доработать: темнее фон, крупнее текст..."
              className="flex-1 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-white/15"
              onKeyDown={e => e.key === 'Enter' && refinement && generate()}
            />
          </div>
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  )
}
