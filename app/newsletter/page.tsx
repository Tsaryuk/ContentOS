'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Mail, Loader2, RefreshCw, Users, Eye, MousePointer, TrendingUp, TrendingDown, Download } from 'lucide-react'

interface Campaign {
  total_sent: number
  total_delivered: number
  total_opened: number
  total_clicked: number
  total_unsubscribed: number
  open_rate: number
  click_rate: number
}

interface Issue {
  id: string
  subject: string
  issue_number: number | null
  status: string
  tag: string
  category: string | null
  scheduled_at: string | null
  sent_at: string | null
  created_at: string
  campaign: Campaign[]
}

export default function NewsletterPage() {
  const router = useRouter()
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)

  const fetchIssues = useCallback(async () => {
    const res = await fetch('/api/newsletter/issues')
    const data = await res.json()
    if (data.issues) setIssues(data.issues)
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/newsletter/stats')
      const data = await res.json()
      if (data.subscriber_count !== undefined) setSubscriberCount(data.subscriber_count)
    } catch { /* ignore if unisender not configured */ }
  }, [])

  useEffect(() => {
    async function init() {
      await Promise.all([fetchIssues(), fetchStats()])
      setLoading(false)
    }
    init()
  }, [fetchIssues, fetchStats])

  async function handleCreate() {
    const res = await fetch('/api/newsletter/issues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: '', tag: 'Разговор о...' }),
    })
    const data = await res.json()
    if (data.issue) {
      router.push(`/newsletter/editor/${data.issue.id}`)
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('ru-RU', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  }

  const sentIssues = issues.filter(i => i.campaign?.[0]?.total_sent > 0)
  const avgOpenRate = sentIssues.length > 0
    ? sentIssues.reduce((sum, i) => sum + (i.campaign?.[0]?.open_rate ?? 0), 0) / sentIssues.length
    : 0

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-dim" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Mail className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-semibold text-cream">Рассылка</h1>
          <span className="text-xs text-dim px-2 py-0.5 bg-white/5 rounded-full">
            {issues.length} {issues.length === 1 ? 'выпуск' : 'выпусков'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (importing) return
              setImporting(true)
              try {
                const res = await fetch('/api/newsletter/import', { method: 'POST' })
                const data = await res.json()
                if (data.imported > 0) fetchIssues()
              } finally {
                setImporting(false)
              }
            }}
            disabled={importing}
            className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream disabled:opacity-50 flex items-center gap-1.5"
            title="Импорт кампаний из Unisender"
          >
            {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            Импорт
          </button>
          <button
            onClick={() => { fetchIssues(); fetchStats() }}
            className="p-2 text-dim hover:text-muted transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleCreate}
            className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs hover:bg-accent/90 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Новый выпуск
          </button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4">
        <div className="p-4 bg-surface border border-border rounded-xl">
          <div className="flex items-center gap-2 text-dim mb-1">
            <Users className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-wider">Подписчики</span>
          </div>
          <div className="text-xl font-semibold text-cream">
            {subscriberCount !== null ? subscriberCount.toLocaleString() : '---'}
          </div>
        </div>
        <div className="p-4 bg-surface border border-border rounded-xl">
          <div className="flex items-center gap-2 text-dim mb-1">
            <Mail className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-wider">Выпусков</span>
          </div>
          <div className="text-xl font-semibold text-cream">{sentIssues.length}</div>
        </div>
        <div className="p-4 bg-surface border border-border rounded-xl">
          <div className="flex items-center gap-2 text-dim mb-1">
            <Eye className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-wider">Ср. Open Rate</span>
          </div>
          <div className="text-xl font-semibold text-cream">{avgOpenRate.toFixed(1)}%</div>
        </div>
        <div className="p-4 bg-surface border border-border rounded-xl">
          <div className="flex items-center gap-2 text-dim mb-1">
            <MousePointer className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase tracking-wider">Ср. Click Rate</span>
          </div>
          <div className="text-xl font-semibold text-cream">
            {sentIssues.length > 0
              ? (sentIssues.reduce((s, i) => s + (i.campaign?.[0]?.click_rate ?? 0), 0) / sentIssues.length).toFixed(1)
              : '0.0'}%
          </div>
        </div>
      </div>

      {/* Issues list */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {issues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Mail className="w-10 h-10 text-dim mb-3" />
            <p className="text-muted mb-1">Нет выпусков</p>
            <p className="text-xs text-dim mb-4">Создайте первый выпуск рассылки</p>
            <button
              onClick={handleCreate}
              className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Создать выпуск
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {issues.map((issue, idx) => {
              const campaign = issue.campaign?.[0]
              const prevIssue = issues[idx + 1]
              const prevCampaign = prevIssue?.campaign?.[0]

              return (
                <button
                  key={issue.id}
                  onClick={() => router.push(`/newsletter/editor/${issue.id}`)}
                  className="w-full flex items-center gap-4 p-4 bg-surface border border-border rounded-xl hover:border-accent/30 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent/10 text-accent flex items-center justify-center text-sm font-bold shrink-0">
                    {issue.issue_number ?? '#'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-cream truncate">
                        {issue.subject || 'Без темы'}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                        issue.status === 'draft' ? 'bg-white/5 text-dim' :
                        issue.status === 'uploaded' ? 'bg-blue-500/10 text-blue-400' :
                        issue.status === 'scheduled' ? 'bg-yellow-500/10 text-yellow-400' :
                        'bg-green-500/10 text-green-400'
                      }`}>
                        {issue.status === 'draft' ? 'Черновик' :
                         issue.status === 'uploaded' ? 'Загружено' :
                         issue.status === 'scheduled' ? 'Запланировано' : 'Отправлено'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {issue.tag && <span className="text-[10px] text-dim">{issue.tag}</span>}
                      {issue.category && <span className="text-[10px] text-accent/60">{issue.category}</span>}
                      <span className="text-[10px] text-dim">
                        {formatDate(issue.sent_at ?? issue.scheduled_at ?? issue.created_at)}
                      </span>
                    </div>
                  </div>
                  {campaign && campaign.total_sent > 0 && (
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <div className="text-xs text-muted flex items-center gap-1">
                          <Eye className="w-3 h-3" />
                          {campaign.open_rate}%
                          {prevCampaign && prevCampaign.open_rate > 0 && (
                            campaign.open_rate >= prevCampaign.open_rate
                              ? <TrendingUp className="w-3 h-3 text-green-400" />
                              : <TrendingDown className="w-3 h-3 text-red-400" />
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted flex items-center gap-1">
                          <MousePointer className="w-3 h-3" />
                          {campaign.click_rate}%
                        </div>
                      </div>
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
