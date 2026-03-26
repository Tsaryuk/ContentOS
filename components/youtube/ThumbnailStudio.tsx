'use client'

import { useState, useRef } from 'react'
import { Upload, Wand2, Loader2, X, Image as ImageIcon, RefreshCw } from 'lucide-react'

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
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [referenceFile, setReferenceFile] = useState<{ file: File; preview: string } | null>(null)
  const [referenceUrl, setReferenceUrl] = useState<string>('')
  const [selectedText, setSelectedText] = useState(textVariants[0] ?? '')
  const [customText, setCustomText] = useState('')
  const [refinement, setRefinement] = useState('')
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [generatedUrls, setGeneratedUrls] = useState<string[]>(initialUrls ?? [])
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const photoInputRef = useRef<HTMLInputElement>(null)
  const refInputRef = useRef<HTMLInputElement>(null)

  const handlePhotoUpload = (files: FileList | null) => {
    if (!files) return
    const newPhotos = Array.from(files).slice(0, 3 - photos.length).map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setPhotos(prev => [...prev, ...newPhotos].slice(0, 3))
  }

  const removePhoto = (idx: number) => {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const handleReferenceUpload = (files: FileList | null) => {
    if (!files?.[0]) return
    if (referenceFile) URL.revokeObjectURL(referenceFile.preview)
    setReferenceFile({ file: files[0], preview: URL.createObjectURL(files[0]) })
  }

  const uploadFiles = async (): Promise<{ photoUrls: string[]; refUrl: string }> => {
    setUploading(true)
    const result = { photoUrls: [] as string[], refUrl: '' }

    try {
      if (photos.length > 0) {
        const formData = new FormData()
        formData.set('videoId', videoId)
        photos.forEach((p, i) => formData.set(`file${i}`, p.file))

        const res = await fetch('/api/thumbnail/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (data.urls) result.photoUrls = data.urls
      }

      if (referenceFile) {
        const formData = new FormData()
        formData.set('videoId', videoId)
        formData.set('file0', referenceFile.file)

        const res = await fetch('/api/thumbnail/upload', { method: 'POST', body: formData })
        const data = await res.json()
        if (data.urls?.[0]) result.refUrl = data.urls[0]
      }
    } finally {
      setUploading(false)
    }

    return result
  }

  const handleGenerate = async () => {
    const text = customText || selectedText
    if (!text) { setError('Выберите или введите текст для обложки'); return }

    setGenerating(true)
    setError(null)

    try {
      const uploaded = await uploadFiles()
      setPhotoUrls(uploaded.photoUrls)
      if (uploaded.refUrl) setReferenceUrl(uploaded.refUrl)

      const res = await fetch('/api/thumbnail/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          photos: uploaded.photoUrls,
          text,
          referenceUrl: uploaded.refUrl || referenceUrl || undefined,
          refinement: refinement || undefined,
        }),
      })

      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.urls?.length) {
        setGeneratedUrls(data.urls)
        setRefinement('')
      } else {
        setError('Не удалось сгенерировать обложки')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleRefine = async () => {
    if (!refinement) return
    await handleGenerate()
  }

  const activeText = customText || selectedText

  return (
    <div className="space-y-6">
      <h3 className="text-base font-medium flex items-center gap-2">
        <ImageIcon className="w-4 h-4" /> Студия обложек
      </h3>

      {/* Photo Upload */}
      <div>
        <label className="text-sm text-white/50 mb-2 block">Фото для обложки (до 3 шт)</label>
        <div className="flex gap-3 flex-wrap">
          {photos.map((p, i) => (
            <div key={i} className="relative w-28 h-28 rounded-lg overflow-hidden border border-white/10">
              <img src={p.preview} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removePhoto(i)}
                className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {photos.length < 3 && (
            <button
              onClick={() => photoInputRef.current?.click()}
              className="w-28 h-28 rounded-lg border border-dashed border-white/20 flex flex-col items-center justify-center gap-1 text-white/30 hover:text-white/50 hover:border-white/30 transition-colors"
            >
              <Upload className="w-5 h-5" />
              <span className="text-xs">Загрузить</span>
            </button>
          )}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => handlePhotoUpload(e.target.files)}
          />
        </div>
      </div>

      {/* Reference Image */}
      <div>
        <label className="text-sm text-white/50 mb-2 block">Референс стиля обложки</label>
        <div className="flex gap-3 items-start">
          {referenceFile ? (
            <div className="relative w-40 h-24 rounded-lg overflow-hidden border border-white/10">
              <img src={referenceFile.preview} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => { URL.revokeObjectURL(referenceFile.preview); setReferenceFile(null) }}
                className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : currentThumbnail ? (
            <div className="relative w-40 h-24 rounded-lg overflow-hidden border border-white/10 opacity-60">
              <img src={currentThumbnail} alt="" className="w-full h-full object-cover" />
              <span className="absolute bottom-1 left-1 text-[10px] bg-black/60 px-1 rounded">Текущая</span>
            </div>
          ) : null}
          <button
            onClick={() => refInputRef.current?.click()}
            className="h-24 px-4 rounded-lg border border-dashed border-white/20 flex flex-col items-center justify-center gap-1 text-white/30 hover:text-white/50 hover:border-white/30 transition-colors"
          >
            <Upload className="w-5 h-5" />
            <span className="text-xs">Загрузить референс</span>
          </button>
          <input
            ref={refInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => handleReferenceUpload(e.target.files)}
          />
        </div>
      </div>

      {/* Text Selection */}
      <div>
        <label className="text-sm text-white/50 mb-2 block">Текст на обложку</label>
        <div className="space-y-2">
          {textVariants.map((t, i) => (
            <button
              key={i}
              onClick={() => { setSelectedText(t); setCustomText('') }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                selectedText === t && !customText
                  ? 'bg-white/10 border border-white/20 text-white'
                  : 'bg-white/[0.03] border border-white/[0.06] text-white/60 hover:text-white/80'
              }`}
            >
              {t}
            </button>
          ))}
          <input
            type="text"
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            placeholder="Или введите свой текст..."
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/20"
          />
        </div>
      </div>

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={generating || uploading || !activeText}
        className="w-full py-3 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-medium flex items-center justify-center gap-2 transition-colors"
      >
        {generating || uploading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> {uploading ? 'Загрузка фото...' : 'Генерация...'}</>
        ) : (
          <><Wand2 className="w-4 h-4" /> Сгенерировать обложки</>
        )}
      </button>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Generated Results */}
      {generatedUrls.length > 0 && (
        <div>
          <label className="text-sm text-white/50 mb-2 block">Результаты ({generatedUrls.length})</label>
          <div className="grid grid-cols-1 gap-3">
            {generatedUrls.map((url, i) => (
              <button
                key={i}
                onClick={() => { setSelectedUrl(url); onSelect(url) }}
                className={`relative rounded-lg overflow-hidden border-2 transition-colors ${
                  selectedUrl === url ? 'border-purple-500' : 'border-transparent hover:border-white/20'
                }`}
              >
                <img src={url} alt={`Variant ${i + 1}`} className="w-full aspect-video object-cover" />
                {selectedUrl === url && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">✓</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Refine */}
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={refinement}
              onChange={e => setRefinement(e.target.value)}
              placeholder="Доработать: сделай фон темнее, увеличь текст..."
              className="flex-1 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/20"
            />
            <button
              onClick={handleRefine}
              disabled={!refinement || generating}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 disabled:opacity-40 text-sm flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-3 h-3" /> Перегенерировать
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
