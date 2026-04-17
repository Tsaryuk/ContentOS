'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Loader2, ArrowRight, Maximize2, Minimize2 } from 'lucide-react'

interface WhitePaperProps {
  articleId: string
  initialText?: string
  onDone: (textAsHtml: string) => void
  onClose: () => void
  onDraftSave?: (text: string) => void // bubble autosaved text up to parent state
}

export function WhitePaper({ articleId, initialText, onDone, onClose, onDraftSave }: WhitePaperProps) {
  const [text, setText] = useState(initialText ?? '')
  const [styleRunning, setStyleRunning] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [showInstruction, setShowInstruction] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const saveTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  // Sync isFullscreen with browser fullscreen state (handles Esc press).
  useEffect(() => {
    function onChange(): void {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  async function toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if (containerRef.current) {
        await containerRef.current.requestFullscreen()
      }
    } catch {
      // Fullscreen may be blocked (iframes, permissions) — noop.
    }
  }

  // Track last saved text so we don't resave identical content
  const lastSavedRef = useRef(initialText ?? '')

  // Autosave 3s after last keystroke, only if content actually changed.
  // Uses dedicated lightweight /draft endpoint (single UPDATE, no republish).
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    if (text === lastSavedRef.current) return // nothing new to save

    saveTimer.current = setTimeout(async () => {
      const toSave = text
      setSaving(true)
      try {
        const res = await fetch(`/api/articles/${articleId}/draft`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft_text: toSave }),
        })
        if (res.ok) {
          lastSavedRef.current = toSave
          onDraftSave?.(toSave)
        }
      } catch { /* next keystroke will retry */ }
      setSaving(false)
    }, 3000)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [text, articleId, onDraftSave])

  // Flush pending changes on unmount / close
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      // Only flush if there's unsaved content
      if (textRef.current !== lastSavedRef.current) {
        fetch(`/api/articles/${articleId}/draft`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft_text: textRef.current }),
          keepalive: true,
        }).catch(() => {})
        onDraftSave?.(textRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep a ref to current text for the unmount cleanup
  const textRef = useRef(text)
  useEffect(() => { textRef.current = text }, [text])

  async function handleStyleEdit(): Promise<void> {
    if (!text.trim() || styleRunning) return
    setStyleRunning(true)
    try {
      const res = await fetch('/api/articles/style-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, instruction: instruction.trim() || undefined }),
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        alert(`Ошибка ${res.status}: ${t.slice(0, 300)}`)
        return
      }
      const data = await res.json()
      if (data.error) { alert(data.error); return }
      if (data.text) {
        setText(data.text)
        setInstruction('')
        setShowInstruction(false)
        // Save to draft immediately
        fetch(`/api/articles/${articleId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draft_text: data.text }),
        }).catch(() => {})
      }
    } catch (e) {
      alert('Ошибка: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setStyleRunning(false) }
  }

  // Convert plain text to minimal HTML (paragraphs) — no formatting,
  // just enough structure for the regular editor to work with
  function textToHtml(rawText: string): string {
    return rawText
      .split(/\n\s*\n+/) // split by blank lines into paragraphs
      .map(para => para.trim())
      .filter(Boolean)
      .map(para => {
        // Preserve single newlines inside a paragraph as <br>
        const withBreaks = para.replace(/\n/g, '<br>')
        return `<p>${withBreaks}</p>`
      })
      .join('\n')
  }

  function handleSendToEditor(): void {
    const html = text.trim() ? textToHtml(text) : ''
    // Save and hand off
    fetch(`/api/articles/${articleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_text: text, body_html: html }),
    }).catch(() => {})
    onDone(html)
  }

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-bg flex flex-col">
      {/* Minimal header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-border/40">
        <div>
          <div className="text-[11px] text-dim tracking-[0.2em] uppercase">Белый лист</div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-dim">
          <span>{wordCount} слов</span>
          {saving && <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> сохранение...</span>}

          <button
            onClick={toggleFullscreen}
            className="p-1.5 text-dim hover:text-cream transition-colors"
            title={isFullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>


          <button
            onClick={() => setShowInstruction(v => !v)}
            disabled={styleRunning}
            className="px-3 py-1.5 border border-border/60 rounded-full text-xs text-muted hover:text-cream hover:border-muted disabled:opacity-40"
            title="Добавить замечание для AI-стилиста"
          >
            Замечание
          </button>

          <button
            onClick={handleStyleEdit}
            disabled={!text.trim() || styleRunning}
            className="px-4 py-1.5 bg-accent/10 text-accent border border-accent/30 rounded-full text-xs font-medium hover:bg-accent/20 disabled:opacity-40 flex items-center gap-2"
          >
            {styleRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {styleRunning ? 'AI правит...' : 'AI-стилист'}
          </button>

          <button
            onClick={() => {
              if (!text.trim()) { alert('Черновик пустой'); return }
              if (!confirm('Перенести черновик в редактор?\n\nТекущее содержимое редактора будет ЗАМЕНЕНО черновиком.\nЧерновик сохранится — можешь вернуться в белый лист и продолжить.')) return
              handleSendToEditor()
            }}
            className="px-4 py-1.5 bg-white text-black rounded-full text-xs font-medium hover:opacity-90 flex items-center gap-2"
            title="Заменить содержимое редактора этим черновиком"
          >
            Сохранить в редактор <ArrowRight className="w-3 h-3" />
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

      {/* Optional instruction input */}
      {showInstruction && (
        <div className="px-8 py-3 border-b border-border/40 bg-surface">
          <div className="max-w-[720px] mx-auto">
            <input
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder="Замечание для AI: сократи вступление / добавь пример / усиль ритм..."
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent"
              autoFocus
            />
            <p className="text-[10px] text-dim mt-1.5">
              Это замечание AI-стилист учтёт при следующей правке. Можно оставить пустым для общей правки по промпту.
            </p>
          </div>
        </div>
      )}

      {/* Fullscreen textarea */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[720px] mx-auto px-8 py-12">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Просто начни писать. Мысли. Абзацы. Переносы строк.&#10;&#10;Никакого форматирования — только чистый текст.&#10;Нажми AI-стилист, чтобы привести в порядок ритм и стиль.&#10;Нажми 'В редактор', когда готов оформить в HTML."
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
