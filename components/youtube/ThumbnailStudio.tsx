'use client'

import { useState, useRef, useEffect, DragEvent } from 'react'
import { Wand2, Loader2, X, Plus, RefreshCw, Check, Image as ImageIcon, Download } from 'lucide-react'

interface Props {
  videoId: string
  textVariants: string[]
  currentThumbnail?: string
  generatedUrls?: string[]
  savedPhotos?: string[]      // persisted photo URLs from DB
  savedReference?: string     // persisted reference URL from DB
  onSelect: (url: string) => void
}

const hiddenInput: React.CSSProperties = { position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden', pointerEvents: 'none' }

function apiUrl(path: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}${path}`
  }
  return path
}

export function ThumbnailStudio({ videoId, textVariants, currentThumbnail, generatedUrls: initialUrls, savedPhotos, savedReference, onSelect }: Props) {
  const [photos, setPhotos] = useState<{ file?: File; preview: string }[]>([])
  const [reference, setReference] = useState<{ file?: File; preview: string } | null>(null)
  const [selectedText, setSelectedText] = useState(textVariants[0] ?? '')

  // Load saved photos/reference on mount
  useEffect(() => {
    if (savedPhotos?.length && photos.length === 0) {
      setPhotos(savedPhotos.map(url => ({ preview: url })))
    }
    if (savedReference && !reference) {
      setReference({ preview: savedReference })
    }
  }, [savedPhotos, savedReference])
  const [customText, setCustomText] = useState('')
  const [refinement, setRefinement] = useState('')
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState<{ url: string; model: string }[]>(
    (initialUrls ?? []).map(u => ({ url: u, model: '' }))
  )
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const photoRef = useRef<HTMLInputElement>(null)
  const refRef = useRef<HTMLInputElement>(null)

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
    if (!activeText) return
    setGenerating(true)
    setError(null)
    try {
      // Separate new files vs already-uploaded URLs
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

      // Save uploaded URLs to DB for persistence
      if (photoUrls.length > 0 || refUrl) {
        fetch(apiUrl('/api/thumbnail/save-assets'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId, photos: photoUrls, reference: refUrl || undefined }),
        }).catch(() => {}) // fire and forget
      }

      const res = await fetch(apiUrl('/api/thumbnail/generate'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId, photos: photoUrls, text: activeText,
          referenceUrl: refUrl || undefined,
          refinement: refinement || undefined,
        }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.urls?.length) {
        setResults(data.urls.map((url: string, i: number) => ({ url, model: data.models?.[i] ?? '' })))
        setRefinement('')
      } else {
        setError('AI не вернул результатов')
      }
    } catch (err: any) {
      console.error('[ThumbnailStudio]', err)
      setError(`${err.name}: ${err.message}`)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/60 flex items-center gap-2">
          <ImageIcon className="w-4 h-4" /> Обложка
        </h3>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {results.map((r, i) => (
            <button
              key={r.url + i}
              onClick={() => { setSelectedUrl(r.url); onSelect(r.url) }}
              className={`relative group rounded-lg overflow-hidden border-2 transition-all ${
                selectedUrl === r.url ? 'border-emerald-500 ring-1 ring-emerald-500/30' : 'border-white/[0.06] hover:border-white/20'
              }`}
            >
              <img src={r.url} alt="" className="w-full aspect-video object-cover" />
              {r.model && <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded text-[10px] text-white/60">{r.model}</span>}
              {selectedUrl === r.url && (
                <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              <a
                href={r.url}
                download={`thumbnail_${i + 1}.jpg`}
                onClick={e => e.stopPropagation()}
                className="absolute top-1.5 left-1.5 w-6 h-6 bg-black/70 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/90"
                title="Скачать"
              >
                <Download className="w-3 h-3 text-white" />
              </a>
            </button>
          ))}
        </div>
      )}

      {/* Input panel */}
      <div
        className={`rounded-xl border p-3 space-y-3 transition-colors ${dragOver ? 'border-purple-500/50 bg-purple-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e: DragEvent) => { e.preventDefault(); setDragOver(false); addPhotos(e.dataTransfer.files) }}
      >
        {/* Photos + ref row */}
        <div className="flex gap-2 items-center flex-wrap">
          {photos.map((p, i) => (
            <div key={i} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-white/10 flex-shrink-0">
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
            <button onClick={() => photoRef.current?.click()} className="w-14 h-14 rounded-lg border border-dashed border-white/15 flex flex-col items-center justify-center text-white/20 hover:text-white/40 hover:border-white/25 transition-colors flex-shrink-0 gap-0.5">
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
                  ? 'bg-white/12 text-white border border-white/20'
                  : 'bg-white/[0.03] text-white/40 border border-white/[0.06] hover:text-white/60'
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
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-black/30 border border-white/[0.06] text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/15"
            onKeyDown={e => e.key === 'Enter' && generate()}
          />
          <button
            onClick={generate}
            disabled={generating || !activeText}
            className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-30 text-white text-sm font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap flex-shrink-0"
          >
            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
            {generating ? 'AI...' : 'Создать'}
          </button>
        </div>

        {/* Refine */}
        {results.length > 0 && (
          <input
            type="text"
            value={refinement}
            onChange={e => setRefinement(e.target.value)}
            placeholder="Доработать: темнее, крупнее текст..."
            className="w-full px-3 py-1.5 rounded-lg bg-black/20 border border-white/[0.04] text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/10"
            onKeyDown={e => e.key === 'Enter' && refinement && generate()}
          />
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  )
}
