'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2, Sparkles, Mic, MicOff } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface AiChatProps {
  issueId: string
  currentHtml: string
  initialMessages?: Message[]
  onInsertText?: (text: string) => void
}

const QUICK_COMMANDS = [
  { label: 'Черновик', prompt: 'Напиши черновик письма' },
  { label: 'Заголовки', prompt: 'Придумай 5 вариантов заголовка и прехедера' },
  { label: 'Вопрос недели', prompt: 'Напиши 3 варианта вопроса недели' },
  { label: 'Короче', prompt: 'Сделай выделенный текст короче' },
  { label: 'Анонс TG', prompt: 'Напиши анонс этого письма для Telegram-канала @tsaryuk_ru' },
]

export function AiChat({ issueId, currentHtml, initialMessages, onInsertText }: AiChatProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages ?? [])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const messagesEnd = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return

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

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.lang = 'ru-RU'
    recognition.interimResults = false
    recognition.onresult = (e: any) => {
      const text = e.results[0][0].transcript
      setInput(prev => prev + ' ' + text)
      setListening(false)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-accent" />
        <span className="text-xs font-medium text-cream">AI-ассистент</span>
      </div>

      {/* Quick commands */}
      <div className="px-3 py-2 border-b border-border/50 flex flex-wrap gap-1">
        {QUICK_COMMANDS.map(cmd => (
          <button
            key={cmd.label}
            onClick={() => sendMessage(cmd.prompt)}
            disabled={loading}
            className="px-2.5 py-1 bg-surface border border-border rounded-full text-[10px] text-muted hover:text-cream hover:border-accent/50 transition-colors disabled:opacity-50"
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
            <p className="text-xs text-dim">Спроси что-нибудь или используй быстрые команды</p>
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
              {msg.role === 'assistant' && onInsertText && (
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
        <div className="flex gap-2">
          <button
            onClick={toggleVoice}
            className={`p-2 rounded-lg transition-colors ${
              listening ? 'bg-red-500/20 text-red-400' : 'text-dim hover:text-muted'
            }`}
            title="Голосовой ввод"
          >
            {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage(input)}
            placeholder="Спросить AI..."
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
