'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Mail, Users, Eye, MousePointer, AlertTriangle,
  Loader2, RefreshCw, BarChart3, Sparkles, ExternalLink,
  Send, UserMinus
} from 'lucide-react'

interface Campaign {
  id: string
  unisender_campaign_id: number
  total_sent: number
  total_delivered: number
  total_opened: number
  total_clicked: number
  total_unsubscribed: number
  open_rate: number
  click_rate: number
  stats_fetched_at: string | null
  raw_stats: any
}

interface Issue {
  id: string
  subject: string
  preheader: string
  tag: string
  subtitle: string
  body_html: string
  issue_number: number | null
  status: string
  sent_at: string | null
  created_at: string
  category: string | null
  tags: string[]
  campaign: Campaign[]
}

interface AiInsight {
  text: string
  type: 'positive' | 'negative' | 'neutral'
}

export default function NewsletterViewPage() {
  const { id } = useParams<{ id: string }>()
  const [issue, setIssue] = useState<Issue | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [insights, setInsights] = useState<AiInsight[]>([])
  const [loadingInsights, setLoadingInsights] = useState(false)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/newsletter/issues/${id}`)
      const data = await res.json()
      if (data.issue) setIssue(data.issue)
      setLoading(false)
    }
    load()
  }, [id])

  const refreshStats = useCallback(async () => {
    const camp = issue?.campaign?.[0]
    if (!camp?.unisender_campaign_id) return
    setRefreshing(true)
    try {
      await fetch(`/api/newsletter/stats?campaign_id=${camp.unisender_campaign_id}`)
      const res = await fetch(`/api/newsletter/issues/${id}`)
      const data = await res.json()
      if (data.issue) setIssue(data.issue)
    } finally {
      setRefreshing(false)
    }
  }, [issue, id])

  async function generateInsights() {
    const camp = issue?.campaign?.[0]
    if (!camp) return
    setLoadingInsights(true)
    try {
      const res = await fetch('/api/newsletter/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Проанализируй статистику этого выпуска рассылки и дай 3-4 инсайта.
Тема: "${issue?.subject}"
Отправлено: ${camp.total_sent}
Доставлено: ${camp.total_delivered}
Открытия: ${camp.total_opened} (${camp.open_rate}%)
Клики: ${camp.total_clicked} (${camp.click_rate}%)
Отписки: ${camp.total_unsubscribed}
Дай конкретные рекомендации: что сработало, что улучшить, когда лучше отправлять. Формат: по одному инсайту на строку, начиная с + (позитивный), - (негативный) или = (нейтральный).`,
        }),
      })
      const data = await res.json()
      if (data.content) {
        const parsed = data.content.split('\n').filter((l: string) => l.trim()).map((line: string): AiInsight => {
          const trimmed = line.trim()
          if (trimmed.startsWith('+')) return { text: trimmed.slice(1).trim(), type: 'positive' }
          if (trimmed.startsWith('-')) return { text: trimmed.slice(1).trim(), type: 'negative' }
          return { text: trimmed.replace(/^=\s*/, ''), type: 'neutral' }
        })
        setInsights(parsed)
      }
    } finally {
      setLoadingInsights(false)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-dim" />
      </div>
    )
  }

  if (!issue) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted">Выпуск не найден</p>
      </div>
    )
  }

  const camp = issue.campaign?.[0]
  const deliveryRate = camp && camp.total_sent > 0
    ? Math.round((camp.total_delivered / camp.total_sent) * 10000) / 100
    : 0

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Link href="/newsletter" className="p-1.5 text-dim hover:text-muted">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <Mail className="w-5 h-5 text-accent" />
          <div>
            <h1 className="text-sm font-semibold text-cream">{issue.subject || 'Без темы'}</h1>
            <div className="flex items-center gap-2 mt-0.5">
              {issue.tag && <span className="text-[10px] text-dim">{issue.tag}</span>}
              {issue.sent_at && (
                <span className="text-[10px] text-dim">
                  {new Date(issue.sent_at).toLocaleDateString('ru-RU', {
                    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              )}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-400">
                Отправлено
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refreshStats}
            disabled={refreshing}
            className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream disabled:opacity-50 flex items-center gap-1.5"
          >
            {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Обновить статистику
          </button>
          <Link
            href={`/newsletter/editor/${issue.id}`}
            className="px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs hover:bg-accent/20 flex items-center gap-1.5"
          >
            Редактировать
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-6">
          {/* Stats cards */}
          {camp && (
            <div className="grid grid-cols-6 gap-3 mb-6">
              {[
                { icon: Send, label: 'Отправлено', value: camp.total_sent.toLocaleString(), color: 'text-cream' },
                { icon: Mail, label: 'Доставлено', value: `${camp.total_delivered.toLocaleString()} (${deliveryRate}%)`, color: 'text-cream' },
                { icon: Eye, label: 'Открытия', value: `${camp.total_opened.toLocaleString()} (${camp.open_rate}%)`, color: camp.open_rate >= 15 ? 'text-green-400' : camp.open_rate >= 8 ? 'text-cream' : 'text-yellow-400' },
                { icon: MousePointer, label: 'Клики', value: `${camp.total_clicked.toLocaleString()} (${camp.click_rate}%)`, color: camp.click_rate >= 2 ? 'text-green-400' : 'text-cream' },
                { icon: UserMinus, label: 'Отписки', value: camp.total_unsubscribed.toLocaleString(), color: camp.total_unsubscribed > 50 ? 'text-red-400' : 'text-cream' },
                { icon: AlertTriangle, label: 'Спам', value: camp.raw_stats?.spam?.toLocaleString() ?? '0', color: (camp.raw_stats?.spam ?? 0) > 10 ? 'text-red-400' : 'text-cream' },
              ].map(({ icon: Icon, label, value, color }) => (
                <div key={label} className="p-3 bg-surface border border-border rounded-xl">
                  <div className="flex items-center gap-1.5 text-dim mb-1">
                    <Icon className="w-3 h-3" />
                    <span className="text-[10px] uppercase tracking-wider">{label}</span>
                  </div>
                  <div className={`text-sm font-semibold ${color}`}>{value}</div>
                </div>
              ))}
            </div>
          )}

          {/* AI Insights */}
          <div className="mb-6 p-4 bg-surface border border-border rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-xs font-medium text-cream">AI-аналитика</span>
              </div>
              <button
                onClick={generateInsights}
                disabled={loadingInsights || !camp}
                className="px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs hover:bg-accent/20 disabled:opacity-50 flex items-center gap-1.5"
              >
                {loadingInsights ? <Loader2 className="w-3 h-3 animate-spin" /> : <BarChart3 className="w-3 h-3" />}
                Анализировать
              </button>
            </div>
            {insights.length > 0 ? (
              <div className="space-y-2">
                {insights.map((ins, i) => (
                  <div key={i} className={`flex items-start gap-2 text-xs leading-relaxed ${
                    ins.type === 'positive' ? 'text-green-400' :
                    ins.type === 'negative' ? 'text-red-400' : 'text-muted'
                  }`}>
                    <span className="shrink-0 mt-0.5">
                      {ins.type === 'positive' ? '↑' : ins.type === 'negative' ? '↓' : '→'}
                    </span>
                    <span>{ins.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-dim">
                Нажмите «Анализировать» для получения инсайтов по этому выпуску
              </p>
            )}
          </div>

          {/* Email content preview */}
          <div className="bg-white rounded-xl overflow-hidden shadow-lg">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
              <span className="text-xs text-gray-500">Содержимое письма</span>
              {issue.blog_slug && (
                <a
                  href={`https://letters.tsaryuk.ru/articles/${issue.blog_slug}.html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 flex items-center gap-1 hover:underline"
                >
                  Статья на блоге <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            {issue.body_html ? (
              <iframe
                srcDoc={issue.body_html}
                className="w-full border-0"
                style={{ height: '70vh' }}
              />
            ) : (
              <div className="p-12 text-center text-gray-400 text-sm">
                Содержимое письма не загружено
              </div>
            )}
          </div>

          {/* Stats timestamp */}
          {camp?.stats_fetched_at && (
            <p className="text-[10px] text-dim mt-3 text-right">
              Статистика обновлена: {new Date(camp.stats_fetched_at).toLocaleString('ru-RU')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
