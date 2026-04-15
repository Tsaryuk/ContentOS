'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Loader2 } from 'lucide-react'

interface WhitePaperProps {
  articleId: string
  initialText?: string
  onDone: (structuredHtml: string) => void
  onClose: () => void
}

export function WhitePaper({ articleId, initialText, onDone, onClose }: WhitePaperProps) {
  const [text, setText] = useState(initialText ?? '')
  const [working, setWorking] = useState(false)
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<NodeJS.Timeout | null>(null)

  // Focus on mount
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Autosave raw text to article.draft_text every 5s
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaving(true)
      await fetch(`/api/articles/${articleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_text: text }),
      }).catch(() => {})
      setSaving(false)
    }, 5000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [text, articleId])

  async function handleStructure() {
    if (!text.trim() || working) return
    setWorking(true)
    try {
      const res = await fetch('/api/articles/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        alert(`Ошибка ${res.status}: ${t.slice(0, 300)}`)
        return
      }
      const data = await res.json()
      if (data.error) { alert(data.error); return }
      if (data.html) {
        // Save both raw text and structured HTML
        await fetch(`/api/articles/${articleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft_text: text, body_html: data.html }),
        })
        onDone(data.html)
      }
    } catch (e) {
      alert('Ошибка: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setWorking(false) }
  }

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Minimal header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-border/40">
        <div className="text-[11px] text-dim tracking-[0.2em] uppercase">Белый лист</div>
        <div className="flex items-center gap-4 text-[11px] text-dim">
          <span>{wordCount} слов{wordCount === 1 ? '' : wordCount < 5 ? 'а' : ''}</span>
          {saving && <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> сохранение...</span>}
          <button
            onClick={handleStructure}
            disabled={!text.trim() || working}
            className="px-4 py-1.5 bg-white text-black rounded-full text-xs font-medium hover:opacity-90 disabled:opacity-40 flex items-center gap-2"
          >
            {working ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {working ? 'AI форматирует...' : 'Оформить в статью'}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-dim hover:text-cream transition-colors"
            title="Закрыть (черновик сохранён)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Fullscreen textarea */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-8 py-12">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Просто начни писать. Мысли. Абзацы. Переносы строк.&#10;&#10;Никакого форматирования, заголовков, цитат — только текст.&#10;Закончишь — нажмёшь «Оформить в статью», AI структурирует."
            className="w-full bg-transparent text-cream text-lg leading-[1.75] resize-none focus:outline-none placeholder:text-dim/60"
            style={{
              fontFamily: "'Lora', Georgia, serif",
              minHeight: 'calc(100vh - 180px)',
            }}
            spellCheck
          />
        </div>
      </div>
    </div>
  )
}
