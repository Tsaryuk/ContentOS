'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Sparkles, Mic, MicOff, BookMarked, Zap, ArrowRight } from 'lucide-react'
import {
  WIZARD_QUESTIONS,
  type WizardSectionKind,
} from '@/lib/newsletter/wizard-prompts'
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation'
import { useInsertAtCaret } from '@/lib/hooks/useInsertAtCaret'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface AiChatProps {
  issueId: string
  currentHtml: string
  initialMessages?: Message[]
  onInsertText?: (text: string) => void
  // Called when a wizard call replaced a whole section server-side: parent
  // should refresh the editor with the new body_html.
  onBodyHtmlReplaced?: (bodyHtml: string) => void
}

const QUICK_COMMANDS = [
  { label: 'Черновик', prompt: 'Напиши черновик письма' },
  { label: 'Заголовки', prompt: 'Придумай 5 вариантов заголовка и прехедера' },
  { label: 'Вопрос недели', prompt: 'Напиши 3 варианта вопроса недели' },
  { label: 'Короче', prompt: 'Сделай выделенный текст короче' },
  { label: 'Анонс TG', prompt: 'Напиши анонс этого письма для Telegram-канала @tsaryuk_ru' },
]

// Wizard commands map to a backend section-filler route. Click a button,
// get a question, answer (text or voice) — the server rewrites the answer
// in the author's voice and replaces the matching <section data-kind="...">.
const WIZARD_COMMANDS: Array<{ kind: WizardSectionKind; label: string; icon: typeof BookMarked }> = [
  { kind: 'philosophy', label: 'Личная философия', icon: BookMarked },
  { kind: 'lifehack', label: 'Лайфхак', icon: Zap },
  { kind: 'anons', label: 'Анонс', icon: ArrowRight },
]

const WIZARD_SECTION_LABEL: Record<WizardSectionKind, string> = {
  philosophy: 'Личная философия',
  lifehack: 'Лайфхак недели',
  anons: 'Анонс следующего выпуска',
}

export function AiChat({
  issueId,
  currentHtml,
  initialMessages,
  onInsertText,
  onBodyHtmlReplaced,
}: AiChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? [])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  // Active wizard step: when set, the next user message goes to the
  // fill-section endpoint instead of the generic /api/newsletter/ai.
  const [wizardKind, setWizardKind] = useState<WizardSectionKind | null>(null)
  const messagesEnd = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const insertAtCaret = useInsertAtCaret(inputRef, input, setInput)
  const voice = useVoiceDictation({ onFinal: insertAtCaret.insert })

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function startWizard(kind: WizardSectionKind) {
    setWizardKind(kind)
    setMessages(prev => [...prev, { role: 'assistant', content: WIZARD_QUESTIONS[kind] }])
  }

  async function sendWizardAnswer(kind: WizardSectionKind, text: string) {
    if (!text.trim() || loading) return
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(`/api/newsletter/issues/${issueId}/fill-section`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, user_input: text }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Ошибка: ${data.error ?? res.status}` },
        ])
        return
      }
      if (typeof data.body_html === 'string') {
        onBodyHtmlReplaced?.(data.body_html)
      }
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `Готово, вставил в секцию «${WIZARD_SECTION_LABEL[kind]}». Хочешь заполнить следующую — жми кнопку ниже.`,
        },
      ])
      setWizardKind(null)
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ошибка соединения' }])
    } finally {
      setLoading(false)
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return

    // In wizard mode the user's next message is raw section input — route it
    // to the section-filler instead of the generic chat.
    if (wizardKind) {
      await sendWizardAnswer(wizardKind, text)
      return
    }

    const selectedText = typeof window !== 'undefined' && (window as any).__nlGetSelectedText
      ? (window as any).__nlGetSelectedText()
      : ''

    const userMsg: Message = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/newsletter/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue_id: issueId,
          message: text,
          current_html: currentHtml,
          selected_text: selectedText,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Ошибка: ${data.error}` }])
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.content }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Ошибка соединения' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent" />
        <span className="text-xs font-medium text-cream">AI-ассистент</span>
        {wizardKind && (
          <span className="text-[10px] text-accent bg-accent/10 px-2 py-0.5 rounded-full ml-auto">
            Заполняю: {WIZARD_SECTION_LABEL[wizardKind]}
          </span>
        )}
      </div>

      {/* Wizard commands — build the editable sections of the letter */}
      <div className="px-3 py-2 border-b border-border/50 flex flex-wrap gap-1">
        {WIZARD_COMMANDS.map(cmd => {
          const Icon = cmd.icon
          const active = wizardKind === cmd.kind
          return (
            <button
              key={cmd.kind}
              onClick={() => startWizard(cmd.kind)}
              disabled={loading}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] transition-colors disabled:opacity-50 border ${
                active
                  ? 'bg-accent/20 text-accent border-accent/60'
                  : 'bg-accent/10 text-accent border-accent/30 hover:bg-accent/20'
              }`}
              title={`Заполнить блок «${cmd.label}»`}
            >
              <Icon className="w-3 h-3" />
              {cmd.label}
            </button>
          )
        })}
      </div>

      {/* Generic quick commands */}
      <div className="px-3 py-2 border-b border-border/50 flex flex-wrap gap-1">
        {QUICK_COMMANDS.map(cmd => (
          <button
            key={cmd.label}
            onClick={() => sendMessage(cmd.prompt)}
            disabled={loading || wizardKind !== null}
            className="px-2.5 py-1 bg-surface border border-border rounded-full text-[10px] text-muted hover:text-cream hover:border-accent/50 transition-colors disabled:opacity-50"
            title={wizardKind ? 'Сначала ответь на вопрос визарда или нажми Отмена' : undefined}
          >
            {cmd.label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Sparkles className="w-8 h-8 text-dim mx-auto mb-3" />
            <p className="text-xs text-dim">Собери письмо: нажми «Личная философия», «Лайфхак» или «Анонс» — я задам вопрос.</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-accent/10 text-cream'
                : 'bg-surface text-muted'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
              {msg.role === 'assistant' && onInsertText && !wizardKind && (
                <button
                  onClick={() => onInsertText(msg.content)}
                  className="mt-2 text-[10px] text-accent hover:underline"
                >
                  Вставить в редактор
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-surface rounded-xl px-3 py-2">
              <Loader2 className="w-4 h-4 animate-spin text-accent" />
            </div>
          </div>
        )}
        <div ref={messagesEnd} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border">
        {wizardKind && (
          <button
            onClick={() => setWizardKind(null)}
            disabled={loading}
            className="mb-2 text-[10px] text-dim hover:text-muted underline"
          >
            Отмена — вернуться к обычному чату
          </button>
        )}
        {/* Live interim transcript — shown only while the mic is hot. */}
        {voice.listening && voice.interim && (
          <div className="mb-2 text-[10px] text-accent italic flex items-start gap-1.5">
            <span className="text-red-400 shrink-0">●</span>
            <span className="whitespace-pre-wrap">{voice.interim}</span>
          </div>
        )}
        <div className="flex gap-2">
          <button
            onClick={voice.toggle}
            className={`p-2 rounded-lg transition-colors ${
              voice.listening ? 'bg-red-500/20 text-red-400' : 'text-dim hover:text-muted'
            }`}
            title={voice.listening ? 'Остановить запись' : 'Голосовой ввод'}
          >
            {voice.listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
            placeholder={wizardKind ? 'Ответь на вопрос выше...' : 'Спросить AI...'}
            className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="p-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
