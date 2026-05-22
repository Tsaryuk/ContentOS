// Per-project CTA configuration shown inside the settings → projects card.
// Whatever lives here drives the comment-reply AI's promotional choices:
// description + audience keywords go straight into the system prompt, URL
// goes into the reply text. Priority is a numeric tiebreaker when several
// projects look equally relevant — higher wins.
//
// Kept dumb: parent owns the save flow, this component is purely a form.

'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

export interface ProjectCtaValue {
  cta_url: string
  cta_description: string
  cta_audience_keywords: string[]
  cta_priority: number
}

interface Props {
  initial: ProjectCtaValue
  saving: boolean
  onSave: (next: ProjectCtaValue) => void | Promise<void>
}

const labelClass = 'text-[10px] text-muted-foreground uppercase tracking-wider font-medium'
const inputClass =
  'w-full h-9 px-3 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'
const textareaClass =
  'w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none'

export function ProjectCtaEditor({ initial, saving, onSave }: Props) {
  const [value, setValue] = useState<ProjectCtaValue>(initial)
  const [keywordsInput, setKeywordsInput] = useState<string>(initial.cta_audience_keywords.join(', '))

  // Re-sync when the parent refetches projects (e.g. after a name save
  // somewhere else) so the form doesn't stale-cache the CTA fields.
  useEffect(() => {
    setValue(initial)
    setKeywordsInput(initial.cta_audience_keywords.join(', '))
  }, [initial])

  function commitKeywords(): void {
    const parsed = keywordsInput
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    setValue((v) => ({ ...v, cta_audience_keywords: parsed }))
  }

  const dirty =
    value.cta_url !== initial.cta_url ||
    value.cta_description !== initial.cta_description ||
    value.cta_priority !== initial.cta_priority ||
    value.cta_audience_keywords.join(',') !== initial.cta_audience_keywords.join(',')

  return (
    <div className="border-t border-border px-5 py-4 space-y-3 bg-card/30">
      <div className="text-xs text-muted-foreground mb-1">
        Когда комментарий релевантен — AI вставит ссылку на этот проект в ответ.
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>URL проекта</label>
          <input
            type="url"
            placeholder="https://..."
            value={value.cta_url}
            onChange={(e) => setValue((v) => ({ ...v, cta_url: e.target.value }))}
            className={`mt-1 ${inputClass}`}
          />
        </div>
        <div>
          <label className={labelClass}>Приоритет (0–100)</label>
          <input
            type="number"
            min={0}
            max={100}
            value={value.cta_priority}
            onChange={(e) => setValue((v) => ({ ...v, cta_priority: Number(e.target.value) }))}
            className={`mt-1 ${inputClass}`}
          />
          <div className="text-[10px] text-muted-foreground mt-1">
            Выше — чаще попадает к AI первым в списке. Дефолт 0.
          </div>
        </div>
      </div>

      <div>
        <label className={labelClass}>Что это (для AI)</label>
        <textarea
          value={value.cta_description}
          onChange={(e) => setValue((v) => ({ ...v, cta_description: e.target.value }))}
          placeholder="Подкаст-диалог о смыслах. Не для разовых вопросов, а для тех, кому интересно мышление."
          rows={3}
          className={`mt-1 ${textareaClass}`}
        />
        <div className="text-[10px] text-muted-foreground mt-1">
          Короткое описание, на основе которого AI решит — подходит ли проект под комментарий.
        </div>
      </div>

      <div>
        <label className={labelClass}>Темы (через запятую)</label>
        <textarea
          value={keywordsInput}
          onChange={(e) => setKeywordsInput(e.target.value)}
          onBlur={commitKeywords}
          placeholder="мышление, философия, психология, смысл жизни"
          rows={2}
          className={`mt-1 ${textareaClass}`}
        />
        <div className="text-[10px] text-muted-foreground mt-1">
          AI ищет совпадение по этим темам в тексте видео и комментария.
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={() => {
            // Commit pending keywords-from-textarea before sending up.
            const parsed = keywordsInput
              .split(/[,\n]/)
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
            void onSave({ ...value, cta_audience_keywords: parsed })
          }}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-accent-surface disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          Сохранить CTA
        </button>
        {!value.cta_url && (
          <span className="text-[10px] text-amber-500">URL пустой — проект не появится в выборе AI.</span>
        )}
      </div>
    </div>
  )
}
