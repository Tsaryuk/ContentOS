// Universal cover generator UI. Inline panel with three stages:
//   1. style picker — small cards driven by /api/covers/styles
//   2. generate — POST /api/covers/generate, shows spinner
//   3. variant picker — thumbnails; clicking one calls /pick to persist
//      to storage, then onSelect(url) hands the storage URL to the parent.
//
// Kept dumb about WHERE the URL goes: the parent owns persistence into
// articles.cover_url / yt_videos.cover_url / etc. The component only knows
// "user picked X, here's the storage URL".

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Loader2, Image as ImageIcon, Settings2, RefreshCw, Sparkles } from 'lucide-react'
import { toast } from '@/lib/toast'
import type { TargetKind, Aspect } from '@/lib/covers/generate'

interface CoverStyleSummary {
  id: string
  slug: string
  name: string
  description: string | null
  default_aspect: string
  variant_count: number
  target_kinds: string[]
  brand_palette: string[]
}

interface VariantOption {
  kind: string
  label: string
  url: string
}

interface GenerateResponse {
  generation_id: string
  style: { slug: string; name: string }
  scene: string
  variants: VariantOption[]
}

export interface CoverGeneratorProps {
  targetKind: TargetKind
  /** Foreign key for /pick storage path. Optional — null is fine, defaults
   *  to "unassigned" in the bucket path. */
  targetId?: string | null
  projectId?: string | null
  /** Used to build the prompt scene if `customScene` is empty. */
  title: string
  description?: string
  /** Override default aspect for this generation. */
  aspect?: Aspect
  /** Called with the persisted storage URL after the user picks a variant. */
  onSelect: (url: string) => void
  /** Optional: notify parent that generation is in-flight (e.g. to disable
   *  surrounding save buttons). */
  onBusyChange?: (busy: boolean) => void
}

export function CoverGenerator({
  targetKind,
  targetId,
  projectId,
  title,
  description,
  aspect,
  onSelect,
  onBusyChange,
}: CoverGeneratorProps) {
  const [styles, setStyles] = useState<CoverStyleSummary[]>([])
  const [stylesLoading, setStylesLoading] = useState(false)
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null)
  const [customScene, setCustomScene] = useState('')
  const [showScene, setShowScene] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [picking, setPicking] = useState<string | null>(null)
  const [variants, setVariants] = useState<VariantOption[]>([])
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [pickedKind, setPickedKind] = useState<string | null>(null)

  const setBusy = useCallback(
    (b: boolean) => {
      onBusyChange?.(b)
    },
    [onBusyChange],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      setStylesLoading(true)
      try {
        const res = await fetch(`/api/covers/styles?target_kind=${encodeURIComponent(targetKind)}`)
        const data = await res.json()
        if (cancelled) return
        if (!res.ok) {
          toast.error(data?.error ?? 'Не удалось загрузить стили')
          return
        }
        const list = (data?.styles ?? []) as CoverStyleSummary[]
        setStyles(list)
        if (list.length > 0) setSelectedStyleId((curr) => curr ?? list[0].id)
      } catch (err) {
        if (!cancelled) {
          toast.error('Сеть: ' + (err instanceof Error ? err.message : String(err)))
        }
      } finally {
        if (!cancelled) setStylesLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [targetKind])

  const selectedStyle = useMemo(
    () => styles.find((s) => s.id === selectedStyleId) ?? null,
    [styles, selectedStyleId],
  )

  async function handleGenerate(): Promise<void> {
    if (!selectedStyleId) {
      toast.error('Выбери стиль')
      return
    }
    if (!title.trim()) {
      toast.error('Заголовок пуст — нечего иллюстрировать')
      return
    }
    setGenerating(true)
    setBusy(true)
    setVariants([])
    setPickedKind(null)
    try {
      const res = await fetch('/api/covers/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          styleId: selectedStyleId,
          targetKind,
          targetId: targetId ?? null,
          projectId: projectId ?? null,
          title,
          description: description?.trim() || undefined,
          customScene: customScene.trim() || undefined,
          aspect,
        }),
      })
      const data = (await res.json()) as GenerateResponse & { error?: string }
      if (!res.ok) {
        toast.error(data?.error ?? `Ошибка ${res.status}`)
        return
      }
      if (!data.variants?.length) {
        toast.error('Модель не вернула ни одного варианта')
        return
      }
      setGenerationId(data.generation_id)
      setVariants(data.variants)
    } catch (err) {
      toast.error('Сеть: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setGenerating(false)
      setBusy(false)
    }
  }

  async function handlePick(variant: VariantOption): Promise<void> {
    if (!generationId) return
    setPicking(variant.kind)
    setBusy(true)
    try {
      const res = await fetch(`/api/covers/${generationId}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variant_kind: variant.kind }),
      })
      const data = await res.json()
      if (!res.ok || !data?.url) {
        toast.error(data?.error ?? `Ошибка ${res.status}`)
        return
      }
      setPickedKind(variant.kind)
      onSelect(data.url)
      toast.success('Обложка сохранена')
    } catch (err) {
      toast.error('Сеть: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setPicking(null)
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Style picker */}
      <div className="flex flex-wrap items-center gap-2">
        {stylesLoading && (
          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
            <Loader2 className="w-3 h-3 animate-spin" /> Стили…
          </span>
        )}
        {!stylesLoading && styles.length === 0 && (
          <span className="text-[11px] text-muted-foreground">Нет доступных стилей для {targetKind}</span>
        )}
        {styles.map((s) => {
          const active = s.id === selectedStyleId
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedStyleId(s.id)}
              title={s.description ?? ''}
              className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
                active
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-muted'
              }`}
            >
              {s.name}
              <span className="ml-1 opacity-60 tabular-nums">×{s.variant_count}</span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || !selectedStyleId || !title.trim()}
          className="px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs hover:bg-accent/20 disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {generating ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : variants.length > 0 ? (
            <RefreshCw className="w-3 h-3" />
          ) : (
            <Sparkles className="w-3 h-3" />
          )}
          {variants.length > 0 ? 'Перегенерировать' : 'Генерировать'}
        </button>
        <button
          type="button"
          onClick={() => setShowScene((v) => !v)}
          className="px-2 py-1.5 border border-border rounded-lg text-xs text-muted-foreground/60 hover:text-foreground inline-flex items-center gap-1"
          title="Свой промпт сцены"
        >
          <Settings2 className="w-3 h-3" /> Промпт
        </button>
        {selectedStyle?.description && (
          <span className="text-[11px] text-muted-foreground/70 line-clamp-1">{selectedStyle.description}</span>
        )}
      </div>

      {showScene && (
        <textarea
          value={customScene}
          onChange={(e) => setCustomScene(e.target.value)}
          placeholder="Своя сцена (на английском). Пусто = соберётся автоматически из заголовка и подзаголовка."
          rows={3}
          className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[11px] text-muted-foreground transition-colors duration-150 focus:outline-none focus:border-accent resize-none font-mono"
        />
      )}

      {variants.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {variants.map((v) => {
            const isPicked = pickedKind === v.kind
            const isPicking = picking === v.kind
            return (
              <button
                key={v.kind}
                type="button"
                onClick={() => handlePick(v)}
                disabled={picking !== null}
                className={`relative flex flex-col items-stretch gap-1 rounded-lg overflow-hidden border-2 transition-colors ${
                  isPicked ? 'border-accent' : 'border-border hover:border-muted'
                } disabled:cursor-wait`}
                title={v.label}
              >
                {/* fal.ai CDN URLs — alt is the label, intentionally not optimised via next/image */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.url} className="w-28 h-16 object-cover" alt={v.label} />
                <span className="px-1 pb-1 text-[9px] text-muted-foreground/80 text-center tabular-nums">
                  {v.label}
                </span>
                {(isPicked || isPicking) && (
                  <div className="absolute top-1 right-1 bg-accent text-white text-[9px] px-1.5 py-0.5 rounded">
                    {isPicking ? '...' : '✓'}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {variants.length === 0 && !generating && stylesLoading === false && styles.length > 0 && (
        <div className="text-[11px] text-muted-foreground/60 inline-flex items-center gap-1.5">
          <ImageIcon className="w-3 h-3" /> Выбери стиль и нажми «Генерировать» — каждый стиль даёт {selectedStyle?.variant_count ?? 3} варианта параллельно.
        </div>
      )}
    </div>
  )
}
