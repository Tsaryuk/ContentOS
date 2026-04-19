'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Mail, Loader2, RefreshCw, Users, Eye, MousePointer,
  TrendingUp, TrendingDown, Download, Trash2,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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

const STATUS_META: Record<string, { label: string; className: string }> = {
  draft:     { label: 'Черновик',        className: 'bg-muted/60 text-muted-foreground' },
  uploaded:  { label: 'Загружено',        className: 'bg-sky-500/10 text-sky-600 dark:text-sky-300' },
  scheduled: { label: 'Запланировано',    className: 'bg-amber-500/10 text-amber-600 dark:text-amber-300' },
  sent:      { label: 'Отправлено',       className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' },
}

function statusMeta(status: string) {
  return STATUS_META[status] ?? STATUS_META.draft
}

export default function NewsletterPage() {
  const router = useRouter()
  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(issueId: string) {
    if (!confirm('Удалить этот выпуск?')) return
    setDeleting(issueId)
    await fetch(`/api/newsletter/issues/${issueId}`, { method: 'DELETE' })
    setDeleting(null)
    fetchIssues()
  }

  async function handleDeleteAll() {
    if (!confirm(`Удалить все ${issues.length} выпусков? Это действие необратимо.`)) return
    for (const issue of issues) {
      await fetch(`/api/newsletter/issues/${issue.id}`, { method: 'DELETE' })
    }
    fetchIssues()
  }

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

  async function handleImport() {
    if (importing) return
    setImporting(true)
    try {
      const res = await fetch('/api/newsletter/import', { method: 'POST' })
      const data = await res.json()
      if (data.imported > 0) fetchIssues()
    } finally {
      setImporting(false)
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
  const avgClickRate = sentIssues.length > 0
    ? sentIssues.reduce((sum, i) => sum + (i.campaign?.[0]?.click_rate ?? 0), 0) / sentIssues.length
    : 0

  const stats = [
    {
      icon: <Users className="w-3.5 h-3.5" />,
      label: 'Подписчики',
      value: subscriberCount !== null ? subscriberCount.toLocaleString('ru-RU') : '—',
      color: 'var(--accent)',
    },
    {
      icon: <Mail className="w-3.5 h-3.5" />,
      label: 'Выпусков',
      value: sentIssues.length.toString(),
      color: 'var(--foreground)',
    },
    {
      icon: <Eye className="w-3.5 h-3.5" />,
      label: 'Ср. Open Rate',
      value: `${avgOpenRate.toFixed(1)}%`,
      color: 'var(--success)',
    },
    {
      icon: <MousePointer className="w-3.5 h-3.5" />,
      label: 'Ср. Click Rate',
      value: `${avgClickRate.toFixed(1)}%`,
      color: 'var(--purple)',
    },
  ]

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2 uppercase tracking-wider">
            <span>ContentOS</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="normal-case tracking-normal">Email-рассылка</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight">Рассылка</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {loading
              ? 'Загружаем…'
              : `${issues.length} ${issues.length === 1 ? 'выпуск' : issues.length < 5 ? 'выпуска' : 'выпусков'} · Unisender`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleImport} disabled={importing} title="Импорт кампаний из Unisender">
            {importing ? <Loader2 className="animate-spin" /> : <Download />}
            Импорт
          </Button>
          {issues.length > 0 && (
            <Button variant="ghost" onClick={handleDeleteAll} className="text-destructive hover:bg-destructive/10">
              <Trash2 />
              Удалить все
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={() => { fetchIssues(); fetchStats() }} title="Обновить">
            <RefreshCw />
          </Button>
          <Button variant="brand" onClick={handleCreate}>
            <Plus />
            Новый выпуск
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {stats.map((s, i) => (
          <Card key={i} className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground mb-2">
              {s.icon}
              <span className="text-[10px] uppercase tracking-wider">{s.label}</span>
            </div>
            <div className="text-2xl font-semibold tabular-nums tracking-tight leading-none" style={{ color: s.color }}>
              {loading ? '—' : s.value}
            </div>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="py-24 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : issues.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center">
          <Mail className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-foreground font-medium mb-1">Пока нет выпусков</p>
          <p className="text-sm text-muted-foreground mb-6">Создай первый выпуск рассылки</p>
          <Button variant="brand" onClick={handleCreate}>
            <Plus />
            Создать выпуск
          </Button>
        </Card>
      ) : (
        <div className="space-y-2">
          {issues.map((issue, idx) => {
            const campaign = issue.campaign?.[0]
            const prevIssue = issues[idx + 1]
            const prevCampaign = prevIssue?.campaign?.[0]
            const meta = statusMeta(issue.status)

            return (
              <Card
                key={issue.id}
                onClick={() => router.push(
                  issue.status === 'sent'
                    ? `/newsletter/view/${issue.id}`
                    : `/newsletter/editor/${issue.id}`,
                )}
                className="flex items-center gap-4 p-4 hover:shadow-card-hover transition-shadow cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center text-sm font-semibold shrink-0">
                  {issue.issue_number ?? '#'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">
                      {issue.subject || 'Без темы'}
                    </span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${meta.className}`}>
                      {meta.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                    {issue.tag && <span>{issue.tag}</span>}
                    {issue.category && <span className="text-accent/70">{issue.category}</span>}
                    <span>{formatDate(issue.sent_at ?? issue.scheduled_at ?? issue.created_at)}</span>
                  </div>
                </div>
                {campaign && campaign.total_sent > 0 && (
                  <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1 tabular-nums">
                      <Eye className="w-3 h-3" />
                      {campaign.open_rate}%
                      {prevCampaign && prevCampaign.open_rate > 0 && (
                        campaign.open_rate >= prevCampaign.open_rate
                          ? <TrendingUp className="w-3 h-3 text-emerald-500" />
                          : <TrendingDown className="w-3 h-3 text-red-500" />
                      )}
                    </div>
                    <div className="flex items-center gap-1 tabular-nums">
                      <MousePointer className="w-3 h-3" />
                      {campaign.click_rate}%
                    </div>
                  </div>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={(e) => { e.stopPropagation(); handleDelete(issue.id) }}
                  disabled={deleting === issue.id}
                  className="text-muted-foreground hover:text-destructive shrink-0"
                  title="Удалить"
                >
                  {deleting === issue.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                </Button>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
