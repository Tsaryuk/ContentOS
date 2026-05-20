// Article ↔ Email linkage card shown in the Distribute tab.
//
// Three visual states:
//   1. No email yet           → "Создать письмо" CTA
//   2. Email exists, not sent → "Открыть письмо" + status (draft/scheduled)
//   3. Email sent             → status + open/click rates + raw counts + "Открыть"
//
// Stats are pulled from /api/articles/[id]/email-status which joins
// nl_issues + nl_campaigns server-side, so the client just renders.

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Mail, ExternalLink, Loader2, RefreshCw } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ArticleEmailStatus {
  hasIssue: boolean
  issue: null | {
    id: string
    issueNumber: number | null
    subject: string
    status: string | null
    scheduledAt: string | null
    sentAt: string | null
  }
  campaign: null | {
    id: string
    unisenderCampaignId: number | null
    status: string | null
    totalSent: number | null
    totalDelivered: number | null
    totalOpened: number | null
    totalClicked: number | null
    totalUnsubscribed: number | null
    openRate: number | null
    clickRate: number | null
    statsFetchedAt: string | null
  }
}

interface Props {
  articleId: string
  onCreateEmail: () => void
  creating: boolean
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatPct(rate: number | null): string {
  if (rate == null) return '—'
  // Unisender returns rates as percentages (0-100), not fractions (0-1).
  // Both shapes appear in the wild depending on stats endpoint; treat
  // anything > 1 as already-percent, otherwise multiply.
  const pct = rate > 1 ? rate : rate * 100
  return pct.toFixed(1) + '%'
}

function statusLabel(status: string | null): { label: string; tone: 'accent' | 'muted' | 'success' | 'warn' } {
  switch (status) {
    case 'sent':
    case 'completed':
      return { label: 'Отправлено', tone: 'success' }
    case 'scheduled':
      return { label: 'Запланировано', tone: 'warn' }
    case 'sending':
      return { label: 'Отправляется', tone: 'warn' }
    case 'draft':
    case null:
      return { label: 'Черновик', tone: 'muted' }
    default:
      return { label: status, tone: 'muted' }
  }
}

export function EmailStatusCard({ articleId, onCreateEmail, creating }: Props) {
  const [status, setStatus] = useState<ArticleEmailStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadStatus = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true)
    try {
      const r = await fetch(`/api/articles/${articleId}/email-status`)
      const d: ArticleEmailStatus | { error: string } = await r.json()
      if ('error' in d) setStatus({ hasIssue: false, issue: null, campaign: null })
      else setStatus(d)
    } catch {
      setStatus({ hasIssue: false, issue: null, campaign: null })
    } finally {
      if (showSpinner) setLoading(false)
    }
  }, [articleId])

  // Refresh = run the Unisender import scoped to this issue's subject,
  // then re-fetch local status to surface any newly-attached campaign or
  // updated open/click counts. Triggers the "copy + send via Unisender UI"
  // reconciliation path described in app/api/newsletter/import/route.ts.
  const refresh = useCallback(async () => {
    if (refreshing || !status?.issue) return
    setRefreshing(true)
    try {
      const subject = status.issue.subject
      const params = new URLSearchParams({ issueId: status.issue.id, subject })
      await fetch(`/api/newsletter/import?${params}`, { method: 'POST' })
      await loadStatus(false)
    } finally {
      setRefreshing(false)
    }
  }, [refreshing, status?.issue, loadStatus])

  useEffect(() => {
    loadStatus(true)
  }, [loadStatus])

  // Case 1: no email at all.
  if (!loading && status && !status.hasIssue) {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-accent" />
            <span className="text-xs font-medium text-foreground">Email рассылка</span>
          </div>
          <Button variant="brand" size="sm" onClick={onCreateEmail} disabled={creating}>
            {creating ? <Loader2 className="animate-spin" /> : <Mail />}
            Создать письмо
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground/60 mt-2">
          AI развернёт первую половину статьи в полноценное письмо + добавит CTA на полную версию
        </p>
      </Card>
    )
  }

  // Loading skeleton.
  if (loading || !status) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-accent" />
          <span className="text-xs font-medium text-foreground">Email рассылка</span>
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/60 ml-1" />
        </div>
      </Card>
    )
  }

  // Cases 2 + 3: issue exists.
  const issue = status.issue!
  const camp = status.campaign
  // Prefer campaign status (it reflects Unisender state) over issue.status
  // (which is the editor's draft/scheduled flag).
  const effectiveStatus = camp?.status ?? issue.status
  const { label, tone } = statusLabel(effectiveStatus)
  const sentAt = camp?.statsFetchedAt && (effectiveStatus === 'sent' || effectiveStatus === 'completed')
    ? camp.statsFetchedAt
    : issue.sentAt
  const isSent = effectiveStatus === 'sent' || effectiveStatus === 'completed'

  const toneClass = {
    accent: 'text-accent bg-accent/10 border-accent/20',
    muted: 'text-muted-foreground bg-card border-border',
    success: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    warn: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  }[tone]

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-accent" />
          <span className="text-xs font-medium text-foreground">
            {issue.issueNumber ? `Письмо #${issue.issueNumber}` : 'Письмо'}
          </span>
          <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border ${toneClass}`}>
            {label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={refresh}
            disabled={refreshing}
            title="Подтянуть статус из Unisender (например, после копии + отправки в новом редакторе)"
            className="p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-accent-surface rounded disabled:opacity-30"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <Button variant="outline" size="sm" asChild className="bg-accent/10 text-accent border-accent/20 hover:bg-accent/20">
            <Link href={`/newsletter/editor/${issue.id}`}>
              <ExternalLink /> Открыть
            </Link>
          </Button>
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground/80 line-clamp-2">{issue.subject}</div>

      {/* Sent date */}
      {isSent && sentAt && (
        <div className="text-[11px] text-muted-foreground/60">
          Отправлено {formatDate(sentAt)}
        </div>
      )}
      {effectiveStatus === 'scheduled' && issue.scheduledAt && (
        <div className="text-[11px] text-muted-foreground/60">
          Запланировано на {formatDate(issue.scheduledAt)}
        </div>
      )}

      {/* Stats — only when sent + campaign data is available */}
      {isSent && camp && (
        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
          <Stat label="Доставлено" value={camp.totalDelivered ?? camp.totalSent ?? 0} />
          <Stat label="Открытий" value={formatPct(camp.openRate)} subtitle={camp.totalOpened ?? 0} />
          <Stat label="Кликов" value={formatPct(camp.clickRate)} subtitle={camp.totalClicked ?? 0} />
        </div>
      )}
    </Card>
  )
}

function Stat({ label, value, subtitle }: { label: string; value: string | number; subtitle?: string | number }) {
  return (
    <div className="text-center">
      <div className="text-sm font-semibold text-foreground">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{label}</div>
      {subtitle != null && (
        <div className="text-[10px] text-muted-foreground/40 mt-0.5">{subtitle}</div>
      )}
    </div>
  )
}
