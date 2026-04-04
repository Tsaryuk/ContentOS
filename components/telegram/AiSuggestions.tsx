'use client'

import { useState } from 'react'
import { Sparkles, Loader2, Lightbulb, Clock, MessageSquare, TrendingUp } from 'lucide-react'

interface Suggestion {
  type: 'post_idea' | 'timing' | 'format' | 'engagement'
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
}

interface AiSuggestionsProps {
  channelId: string
}

const TYPE_ICONS: Record<string, React.ReactNode> = {
  post_idea: <Lightbulb className="w-3.5 h-3.5" />,
  timing: <Clock className="w-3.5 h-3.5" />,
  format: <MessageSquare className="w-3.5 h-3.5" />,
  engagement: <TrendingUp className="w-3.5 h-3.5" />,
}

const PRIORITY_COLORS: Record<string, string> = {
  high: 'border-l-red-400',
  medium: 'border-l-yellow-400',
  low: 'border-l-blue-400',
}

export function AiSuggestions({ channelId }: AiSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function fetchSuggestions() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/telegram/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channelId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuggestions(data.suggestions ?? [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-cream flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-accent" />
          AI-рекомендации
        </h3>
        <button
          onClick={fetchSuggestions}
          disabled={loading || !channelId}
          className="text-xs text-accent hover:text-accent/80 transition-colors disabled:opacity-50 flex items-center gap-1"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {suggestions.length > 0 ? 'Обновить' : 'Получить'}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400 mb-2">{error}</p>
      )}

      {suggestions.length === 0 && !loading && (
        <p className="text-xs text-dim">
          Нажмите "Получить" для AI-анализа контент-плана
        </p>
      )}

      {loading && (
        <div className="flex items-center gap-2 py-4 justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-accent" />
          <span className="text-xs text-muted">Анализирую...</span>
        </div>
      )}

      <div className="space-y-2">
        {suggestions.map((s, i) => (
          <div
            key={i}
            className={`border-l-2 ${PRIORITY_COLORS[s.priority] ?? ''} bg-white/[0.02] rounded-r-lg p-3`}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-accent">{TYPE_ICONS[s.type]}</span>
              <span className="text-xs font-medium text-cream">{s.title}</span>
            </div>
            <p className="text-xs text-muted leading-relaxed">{s.description}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
