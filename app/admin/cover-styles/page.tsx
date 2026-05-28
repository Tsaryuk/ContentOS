'use client'

// Admin CRUD for cover_styles rows.
// Lists every style (active + soft-deleted), lets admins edit prompt
// fragments, toggle active flag, reorder, and create new ones.
// Live-used by the universal CoverGenerator picker — changes here take
// effect on the next picker open.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Plus, Save, Trash2, Eye, EyeOff } from 'lucide-react'
import { toast } from '@/lib/toast'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TARGET_KINDS, ASPECTS } from '@/lib/covers/schema'

interface Variant {
  kind: string
  label: string
  prompt: string
}

interface StyleRow {
  id: string
  slug: string
  name: string
  description: string | null
  scene_template: string
  variants: Variant[]
  negative_prompt: string | null
  model: string
  default_aspect: string
  brand_palette: string[]
  target_kinds: string[]
  is_active: boolean
  sort_order: number
}

// Local-only "new style" shell. Persisted via POST on save.
type DraftStyle = Omit<StyleRow, 'id'> & { id: null }

const EMPTY_DRAFT: DraftStyle = {
  id: null,
  slug: '',
  name: '',
  description: '',
  scene_template: '',
  variants: [{ kind: 'default', label: 'Основной', prompt: '{scene_resolved}' }],
  negative_prompt: '',
  model: 'fal-ai/flux/dev',
  default_aspect: '16:9',
  brand_palette: [],
  target_kinds: [],
  is_active: true,
  sort_order: 0,
}

export default function CoverStylesAdminPage() {
  const [styles, setStyles] = useState<StyleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<StyleRow | DraftStyle | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/covers/styles?admin=1')
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error ?? 'Не удалось загрузить')
        return
      }
      setStyles((data?.styles ?? []) as StyleRow[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave(payload: StyleRow | DraftStyle): Promise<void> {
    setSaving(true)
    try {
      const url = payload.id ? `/api/covers/styles/${payload.id}` : '/api/covers/styles'
      const method = payload.id ? 'PATCH' : 'POST'
      // Strip the local `id: null` from payload before send (POST schema rejects it).
      const { id: _id, ...body } = payload
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          description: body.description || null,
          negative_prompt: body.negative_prompt || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data?.error ?? 'Ошибка')
        return
      }
      toast.success(payload.id ? 'Стиль обновлён' : 'Стиль создан')
      setEditing(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleSoftDelete(id: string): Promise<void> {
    if (!confirm('Скрыть стиль? Останется в БД, но исчезнет из выбора.')) return
    const res = await fetch(`/api/covers/styles/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data?.error ?? 'Ошибка')
      return
    }
    toast.success('Стиль скрыт')
    await load()
  }

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2 uppercase tracking-wider">
          <Link href="/admin" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="w-3 h-3" /> Админка
          </Link>
          <span className="w-1 h-1 rounded-full bg-border" />
          <span className="normal-case tracking-normal">Стили обложек</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight">Стили обложек</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Промпт-шаблоны для универсального генератора обложек. Каждый стиль рассылает {' '}
          <strong className="text-foreground tabular-nums">N</strong> параллельных fal.ai генераций по своим вариантам.
        </p>
      </header>

      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-muted-foreground tabular-nums">
          {loading ? 'Загрузка…' : `${styles.length} стилей (вкл. скрытые)`}
        </span>
        <Button variant="brand" onClick={() => setEditing(EMPTY_DRAFT)} disabled={editing !== null}>
          <Plus className="w-4 h-4" /> Новый стиль
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-2">
          {styles.map((s) => (
            <Card key={s.id} className={`p-4 ${s.is_active ? '' : 'opacity-50'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <strong className="text-sm text-foreground">{s.name}</strong>
                    <code className="text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded">{s.slug}</code>
                    <span className="text-[10px] text-muted-foreground tabular-nums">×{s.variants?.length ?? 0}</span>
                    {!s.is_active && <span className="text-[10px] text-amber-500 inline-flex items-center gap-1"><EyeOff className="w-3 h-3" /> скрыт</span>}
                  </div>
                  {s.description && <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>}
                  <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] text-muted-foreground/80">
                    <span>{s.default_aspect}</span>
                    <span>·</span>
                    <span>{s.model}</span>
                    {s.target_kinds.length > 0 && (
                      <>
                        <span>·</span>
                        <span>{s.target_kinds.join(', ')}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setEditing(s)}>
                    Редактировать
                  </Button>
                  {s.is_active && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => void handleSoftDelete(s.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <StyleEditorPanel
          value={editing}
          saving={saving}
          onChange={setEditing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  )
}

interface PanelProps {
  value: StyleRow | DraftStyle
  saving: boolean
  onChange: (next: StyleRow | DraftStyle) => void
  onSave: (next: StyleRow | DraftStyle) => Promise<void>
  onCancel: () => void
}

function StyleEditorPanel({ value, saving, onChange, onSave, onCancel }: PanelProps) {
  function patch(p: Partial<StyleRow | DraftStyle>): void {
    onChange({ ...value, ...p } as StyleRow | DraftStyle)
  }

  function updateVariant(i: number, p: Partial<Variant>): void {
    const next = value.variants.map((v, idx) => (idx === i ? { ...v, ...p } : v))
    patch({ variants: next })
  }

  function addVariant(): void {
    patch({
      variants: [
        ...value.variants,
        { kind: `var${value.variants.length + 1}`, label: 'Новый вариант', prompt: '{scene_resolved}' },
      ],
    })
  }

  function removeVariant(i: number): void {
    if (value.variants.length <= 1) {
      toast.error('Должен остаться хотя бы один вариант')
      return
    }
    patch({ variants: value.variants.filter((_, idx) => idx !== i) })
  }

  function toggleKind(k: string): void {
    const set = new Set(value.target_kinds)
    if (set.has(k)) set.delete(k)
    else set.add(k)
    patch({ target_kinds: Array.from(set) })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm overflow-y-auto">
      <div className="min-h-full flex items-start justify-center p-4 md:p-8">
        <Card className="w-full max-w-3xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              {value.id ? 'Редактировать стиль' : 'Новый стиль'}
            </h2>
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
              Отмена
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Slug" hint="a-z0-9- (уникальный)">
              <input
                value={value.slug}
                onChange={(e) => patch({ slug: e.target.value })}
                placeholder="my-style"
                className="input"
              />
            </Field>
            <Field label="Название">
              <input
                value={value.name}
                onChange={(e) => patch({ name: e.target.value })}
                className="input"
              />
            </Field>
          </div>

          <Field label="Описание">
            <textarea
              value={value.description ?? ''}
              onChange={(e) => patch({ description: e.target.value })}
              rows={2}
              className="input resize-none"
            />
          </Field>

          <Field label="Scene template" hint="{scene} — заголовок и подзаголовок целевого ресурса">
            <textarea
              value={value.scene_template}
              onChange={(e) => patch({ scene_template: e.target.value })}
              rows={2}
              className="input resize-none font-mono text-xs"
            />
          </Field>

          <Field label="Negative prompt">
            <textarea
              value={value.negative_prompt ?? ''}
              onChange={(e) => patch({ negative_prompt: e.target.value })}
              rows={2}
              className="input resize-none font-mono text-xs"
            />
          </Field>

          <div className="grid md:grid-cols-3 gap-3">
            <Field label="Модель">
              <input
                value={value.model}
                onChange={(e) => patch({ model: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Aspect">
              <select
                value={value.default_aspect}
                onChange={(e) => patch({ default_aspect: e.target.value })}
                className="input"
              >
                {ASPECTS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </Field>
            <Field label="Sort order">
              <input
                type="number"
                min={0}
                max={10000}
                value={value.sort_order}
                onChange={(e) => patch({ sort_order: Number(e.target.value) })}
                className="input tabular-nums"
              />
            </Field>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-1.5">Где использовать</div>
            <div className="flex flex-wrap gap-1.5">
              {TARGET_KINDS.map((k) => {
                const active = value.target_kinds.includes(k)
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => toggleKind(k)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] transition-colors ${
                      active
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {k}
                  </button>
                )
              })}
            </div>
            <div className="text-[10px] text-muted-foreground/70 mt-1.5">
              Пусто = показывать везде.
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Варианты ({value.variants.length})</span>
              <Button variant="ghost" size="sm" onClick={addVariant}>
                <Plus className="w-3.5 h-3.5" /> Добавить вариант
              </Button>
            </div>
            <div className="space-y-2">
              {value.variants.map((v, i) => (
                <Card key={i} className="p-3 space-y-2 bg-muted/30">
                  <div className="grid md:grid-cols-3 gap-2">
                    <input
                      value={v.kind}
                      onChange={(e) => updateVariant(i, { kind: e.target.value })}
                      placeholder="kind"
                      className="input"
                    />
                    <input
                      value={v.label}
                      onChange={(e) => updateVariant(i, { label: e.target.value })}
                      placeholder="label"
                      className="input"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive justify-self-end"
                      onClick={() => removeVariant(i)}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Удалить
                    </Button>
                  </div>
                  <textarea
                    value={v.prompt}
                    onChange={(e) => updateVariant(i, { prompt: e.target.value })}
                    rows={3}
                    placeholder="{scene_resolved}, …"
                    className="input resize-none font-mono text-[11px]"
                  />
                </Card>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={value.is_active}
                onChange={(e) => patch({ is_active: e.target.checked })}
                className="accent-accent"
              />
              {value.is_active ? (
                <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3" /> Активен</span>
              ) : (
                <span className="inline-flex items-center gap-1"><EyeOff className="w-3 h-3" /> Скрыт</span>
              )}
            </label>
            <Button variant="brand" onClick={() => void onSave(value)} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Сохранить
            </Button>
          </div>
        </Card>
      </div>

      <style jsx>{`
        :global(.input) {
          display: block;
          width: 100%;
          padding: 0.375rem 0.75rem;
          border-radius: 0.5rem;
          background: hsl(var(--card));
          border: 1px solid hsl(var(--border));
          font-size: 0.8125rem;
          color: hsl(var(--foreground));
          transition: border-color 0.15s ease;
        }
        :global(.input:focus) {
          outline: none;
          border-color: hsl(var(--accent));
        }
      `}</style>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 block">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-muted-foreground/70 mt-0.5 block">{hint}</span>}
    </label>
  )
}
