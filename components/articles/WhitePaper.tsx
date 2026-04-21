'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Loader2, ArrowRight, Maximize2, Minimize2, MessageSquare, Mic, MicOff, Send } from 'lucide-react'

interface WhitePaperProps {
  articleId: string
  initialText?: string
  onDone: (textAsHtml: string) => void
  onClose: () => void
  onDraftSave?: (text: string) => void // bubble autosaved text up to parent state
}

interface DiscussMessage {
  role: 'user' | 'assistant'
  content: string
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

  // Discussion mode (E2): AI reads the draft, asks targeted questions, author
  // answers by text or voice; pressing "Интегрировать" rewrites the draft
  // weaving the answers in. Panel lives on the right of the textarea when
  // open; closed by default so the минималистичный focus flow is preserved.
  const [discussionOpen, setDiscussionOpen] = useState(false)
  const [messages, setMessages] = useState<DiscussMessage[]>([])
  const [dialogInput, setDialogInput] = useState('')
  const [dialogAsking, setDialogAsking] = useState(false)
  const [integrating, setIntegrating] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const discussionEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    discussionEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, dialogAsking])

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
      if (!res.body) { alert('Пустой ответ сервера'); return }

      // Stream chunks as they arrive so Safari's ~60s fetch timeout can't
      // abort the connection while Anthropic is still generating. The server
      // also sends zero-width spaces as keepalive bytes during the model's
      // extended-thinking phase (before any text is produced).
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        // Strip every keepalive byte, not just the leading one — the server
        // emits one per thinking delta.
        const cleaned = accumulated.replace(/\u200B/g, '')
        if (!cleaned) continue
        setText(cleaned)
      }
      accumulated += decoder.decode()

      const errMatch = accumulated.match(/\n\n\[\[STYLE_EDIT_ERROR\]\] ([\s\S]+)$/)
      if (errMatch) {
        alert('Ошибка: ' + errMatch[1].trim())
        return
      }

      const finalText = accumulated.replace(/\u200B/g, '').trim()
      if (!finalText) { alert('Модель вернула пустой текст'); return }
      setText(finalText)
      setInstruction('')
      setShowInstruction(false)
      fetch(`/api/articles/${articleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_text: finalText }),
      }).catch(() => {})
    } catch (e) {
      alert('Ошибка: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setStyleRunning(false) }
  }

  async function askNextQuestion(history: DiscussMessage[] = messages): Promise<void> {
    if (!text.trim()) { alert('Сначала напиши хоть немного черновика'); return }
    setDialogAsking(true)
    try {
      const res = await fetch('/api/articles/discuss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'next_question', text, messages: history }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Ошибка ${res.status}: ${data.error ?? 'не смог задать вопрос'}` }])
        return
      }
      if (data.question) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.question }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Не получилось сформулировать вопрос. Попробуй ещё раз.' }])
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ошибка соединения' }])
    } finally {
      setDialogAsking(false)
    }
  }

  async function openDiscussion(): Promise<void> {
    if (discussionOpen) { setDiscussionOpen(false); return }
    setDiscussionOpen(true)
    if (messages.length === 0 && text.trim()) {
      await askNextQuestion([])
    }
  }

  async function sendAnswer(): Promise<void> {
    const answer = dialogInput.trim()
    if (!answer || dialogAsking || integrating) return
    const next: DiscussMessage[] = [...messages, { role: 'user', content: answer }]
    setMessages(next)
    setDialogInput('')
    await askNextQuestion(next)
  }

  async function handleIntegrate(): Promise<void> {
    if (integrating || !text.trim()) return
    if (messages.filter(m => m.role === 'user').length === 0) {
      alert('Сначала ответь хотя бы на один вопрос')
      return
    }
    if (!confirm('Встроить ответы в черновик? Текущий текст будет заменён переработанной версией.')) return
    setIntegrating(true)
    try {
      const res = await fetch('/api/articles/discuss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'integrate', text, messages }),
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        alert(`Ошибка ${res.status}: ${t.slice(0, 300)}`)
        return
      }
      if (!res.body) { alert('Пустой ответ сервера'); return }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
        const cleaned = accumulated.replace(/\u200B/g, '')
        if (!cleaned) continue
        setText(cleaned)
      }
      accumulated += decoder.decode()

      const errMatch = accumulated.match(/\n\n\[\[DISCUSS_ERROR\]\] ([\s\S]+)$/)
      if (errMatch) {
        alert('Ошибка: ' + errMatch[1].trim())
        return
      }

      const finalText = accumulated.replace(/\u200B/g, '').trim()
      if (!finalText) { alert('Модель вернула пустой текст'); return }
      setText(finalText)
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ответы встроены в черновик ↓ — проверь в левой части.' }])
      fetch(`/api/articles/${articleId}/draft`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft_text: finalText }),
      }).catch(() => {})
    } catch (e) {
      alert('Ошибка: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setIntegrating(false) }
  }

  function toggleVoice(): void {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      alert('Голосовой ввод не поддерживается этим браузером. В Safari должен работать; в Firefox — не работает. Попробуй Chrome/Safari или введи текст руками.')
      return
    }
    const recognition = new SR()
    recognition.lang = 'ru-RU'
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      setDialogInput(prev => (prev ? prev + ' ' : '') + transcript)
      setListening(false)
    }
    recognition.onerror = (e: any) => {
      setListening(false)
      // Surface the real reason instead of failing silently. Common codes:
      // 'not-allowed' / 'service-not-allowed' — permission denied
      // 'no-speech' — didn't hear anything
      // 'network' — DNS/offline
      // 'audio-capture' — no microphone
      const reason = e?.error || 'unknown'
      if (reason === 'no-speech') return // just silence, no alert
      const msg: Record<string, string> = {
        'not-allowed': 'Браузер запретил доступ к микрофону. Разреши в настройках и попробуй снова.',
        'service-not-allowed': 'Сервис распознавания недоступен (проверь что сайт на HTTPS, включён микрофон в настройках).',
        'audio-capture': 'Микрофон не найден.',
        'network': 'Нет интернета для распознавания речи.',
      }
      alert('Голосовой ввод: ' + (msg[reason] ?? reason))
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch (err) {
      setListening(false)
      alert('Не удалось запустить распознавание: ' + (err instanceof Error ? err.message : String(err)))
    }
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
  const answerCount = messages.filter(m => m.role === 'user').length

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Minimal header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-border/40">
        <div>
          <div className="text-[11px] text-muted-foreground/60 tracking-[0.2em] uppercase">Чистый лист</div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60">
          <span>{wordCount} слов</span>
          {saving && <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> сохранение...</span>}

          <button
            onClick={toggleFullscreen}
            className="p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors"
            title={isFullscreen ? 'Выйти из полноэкранного режима' : 'На весь экран'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            onClick={openDiscussion}
            disabled={styleRunning || integrating}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-full text-xs transition-colors disabled:opacity-40 ${
              discussionOpen
                ? 'bg-accent/20 text-accent border-accent/60'
                : 'bg-accent/10 text-accent border-accent/30 hover:bg-accent/20'
            }`}
            title="Обсудить текст с AI — ответь на несколько вопросов, AI встроит ответы в черновик"
          >
            <MessageSquare className="w-3 h-3" />
            {discussionOpen ? 'Закрыть диалог' : 'Обсудить с AI'}
          </button>

          <button
            onClick={() => setShowInstruction(v => !v)}
            disabled={styleRunning}
            className="px-3 py-1.5 border border-border/60 rounded-full text-xs text-muted-foreground hover:text-foreground hover:border-muted disabled:opacity-40"
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
              if (!confirm('Перенести черновик в редактор?\n\nТекущее содержимое редактора будет ЗАМЕНЕНО черновиком.\nЧерновик сохранится — можешь вернуться в чистый лист и продолжить.')) return
              handleSendToEditor()
            }}
            className="px-4 py-1.5 bg-white text-black rounded-full text-xs font-medium hover:opacity-90 flex items-center gap-2"
            title="Заменить содержимое редактора этим черновиком"
          >
            Сохранить в редактор <ArrowRight className="w-3 h-3" />
          </button>

          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors"
            title="Закрыть (черновик сохранён)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Optional instruction input */}
      {showInstruction && (
        <div className="px-8 py-3 border-b border-border/40 bg-card">
          <div className="max-w-[720px] mx-auto">
            <input
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder="Замечание для AI: сократи вступление / добавь пример / усиль ритм..."
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-accent"
              autoFocus
            />
            <p className="text-[10px] text-muted-foreground/60 mt-1.5">
              Это замечание AI-стилист учтёт при следующей правке. Можно оставить пустым для общей правки по промпту.
            </p>
          </div>
        </div>
      )}

      {/* Main area: textarea (flex-1) + optional discussion panel (right) */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[720px] mx-auto px-8 py-12">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Просто начни писать. Мысли. Абзацы. Переносы строк.&#10;&#10;Никакого форматирования — только чистый текст.&#10;Нажми AI-стилист, чтобы привести в порядок ритм и стиль.&#10;Нажми 'Обсудить с AI', если хочешь чтобы AI задал вопросы и встроил ответы в текст."
              className="w-full bg-transparent text-foreground text-lg leading-[1.75] resize-none focus:outline-none placeholder:text-muted-foreground/60/60"
              style={{
                fontFamily: "'Lora', Georgia, serif",
                minHeight: 'calc(100vh - 180px)',
              }}
              spellCheck
            />
          </div>
        </div>

        {discussionOpen && (
          <div className="w-[380px] shrink-0 border-l border-border/40 flex flex-col min-h-0 bg-card/30">
            <div className="px-4 py-3 border-b border-border/40 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-accent" />
              <span className="text-xs font-medium text-foreground">Обсуждение с AI</span>
              <span className="ml-auto text-[10px] text-muted-foreground/60">
                {answerCount > 0 ? `${answerCount} ${answerCount === 1 ? 'ответ' : 'ответа'}` : 'ответов пока нет'}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {messages.length === 0 && !dialogAsking && (
                <div className="text-center py-8 text-xs text-muted-foreground/60">
                  AI сейчас прочтёт твой черновик и задаст первый вопрос.
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-accent/10 text-foreground'
                      : 'bg-background text-muted-foreground border border-border/40'
                  }`}>
                    <div className="whitespace-pre-wrap">{m.content}</div>
                  </div>
                </div>
              ))}
              {(dialogAsking || integrating) && (
                <div className="flex justify-start">
                  <div className="bg-background rounded-xl px-3 py-2 border border-border/40">
                    <Loader2 className="w-4 h-4 animate-spin text-accent" />
                  </div>
                </div>
              )}
              <div ref={discussionEndRef} />
            </div>

            <div className="p-3 border-t border-border/40 space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={toggleVoice}
                  disabled={dialogAsking || integrating}
                  className={`p-2 rounded-lg transition-colors disabled:opacity-40 ${
                    listening ? 'bg-red-500/20 text-red-400' : 'text-muted-foreground/60 hover:text-foreground'
                  }`}
                  title="Голосовой ввод"
                >
                  {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <input
                  value={dialogInput}
                  onChange={e => setDialogInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendAnswer()}
                  placeholder="Ответь на вопрос (текстом или голосом)..."
                  disabled={dialogAsking || integrating}
                  className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-accent disabled:opacity-40"
                />
                <button
                  onClick={sendAnswer}
                  disabled={!dialogInput.trim() || dialogAsking || integrating}
                  className="p-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50"
                  title="Отправить ответ → AI задаст следующий вопрос"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={handleIntegrate}
                disabled={integrating || dialogAsking || answerCount === 0}
                className="w-full px-3 py-2 bg-accent/10 text-accent border border-accent/30 rounded-lg text-xs font-medium hover:bg-accent/20 disabled:opacity-40 flex items-center justify-center gap-2"
                title="Встроить все ответы в черновик — AI перепишет текст с учётом ответов"
              >
                {integrating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                {integrating ? 'Встраиваю...' : 'Встроить ответы в черновик'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
