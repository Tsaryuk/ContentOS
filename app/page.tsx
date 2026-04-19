'use client'

import { useEffect, useState } from 'react'
import { HeroMetrics } from '@/components/dashboard/HeroMetrics'
import { FilterTabs } from '@/components/dashboard/FilterTabs'
import { ChannelGrid } from '@/components/dashboard/ChannelGrid'
import { AiInsightsBar } from '@/components/dashboard/AiInsightsBar'
import { NewsletterWidget } from '@/components/dashboard/NewsletterWidget'
import { WelcomeHero } from '@/components/dashboard/WelcomeHero'
import { Card } from '@/components/ui/card'
import { Channel, PLATFORM_LABELS, getUniquePlatforms } from '@/lib/channels'

type Period = 'day' | 'week' | 'month'

const PERIOD_LABELS: Record<Period, string> = {
  day:   'Сутки',
  week:  'Неделя',
  month: 'Месяц',
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return Math.round(n / 1_000).toLocaleString('ru-RU') + 'K'
  return n.toLocaleString('ru-RU')
}

function fmtDelta(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${fmtNumber(n)}`
}

interface DashboardMetrics {
  period: Period
  periodDays: number
  channels: Array<{
    id: string
    title: string
    handle: string | null
    thumbnail_url: string | null
    subscribers: number
    views: number
    videos: number
    engagement: number | null
    growth: { subsDelta: number; viewsDelta: number } | null
  }>
  totals: {
    subscribers: number
    views: number
    likes: number
    videos: number
    engagement: number | null
  }
  growth: {
    subscribersDelta: number | null
    subscribersPct:   number | null
    viewsDelta:       number | null
    viewsPct:         number | null
  }
  newsletter: {
    subscribers: number | null
    subscribersDelta: number | null
    subscribersPct:   number | null
  }
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [projectName, setProjectName] = useState('Дашборд')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('all')
  const [period, setPeriod] = useState<Period>('week')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      setLoading(true)
      try {
        const [metricsRes, projectsRes, sessionRes] = await Promise.all([
          fetch(`/api/dashboard/metrics?period=${period}`).then(r => r.json()),
          fetch('/api/projects').then(r => r.json()),
          fetch('/api/auth/session').then(r => r.json()),
        ])
        if (cancelled) return

        const activeProjectId: string | null = sessionRes?.activeProjectId ?? projectsRes?.projects?.[0]?.id ?? null
        setProjectId(activeProjectId)
        const activeProject = projectsRes?.projects?.find((p: { id: string; name: string }) => p.id === activeProjectId)
        if (activeProject) setProjectName(activeProject.name)

        setMetrics(metricsRes)
      } catch (err) {
        console.error('Dashboard load error:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [period])

  const channels: Channel[] = (metrics?.channels ?? []).map(c => ({
    id: c.id,
    name: c.title,
    platform: 'youtube' as const,
    slug: c.handle ?? c.id,
    icon: c.thumbnail_url ?? undefined,
    connected: true,
    metrics: {
      subscribers: c.subscribers,
      views: c.views,
      contentCount: c.videos,
      growthPercent: c.growth?.subsDelta ?? 0,
      engagement: c.engagement ?? undefined,
    },
    href: '/youtube',
  }))

  const platforms = getUniquePlatforms(channels)
  const tabs = [
    { id: 'all', label: 'Все каналы', count: channels.length },
    ...platforms.map(p => ({
      id: p,
      label: PLATFORM_LABELS[p],
      count: channels.filter(c =>
        p === 'youtube' ? c.platform === 'youtube' || c.platform === 'youtube-shorts' : c.platform === p
      ).length,
    })),
  ]

  const filteredChannels = activeTab === 'all'
    ? channels
    : channels.filter(c =>
        activeTab === 'youtube'
          ? c.platform === 'youtube' || c.platform === 'youtube-shorts'
          : c.platform === activeTab
      )

  const g = metrics?.growth

  const subsGrowth = g?.subscribersDelta != null
    ? { value: fmtDelta(g.subscribersDelta) + (g.subscribersPct != null ? ` (${g.subscribersPct > 0 ? '+' : ''}${g.subscribersPct}%)` : ''), positive: g.subscribersDelta >= 0 }
    : undefined

  const viewsGrowth = g?.viewsDelta != null
    ? { value: fmtDelta(g.viewsDelta) + (g.viewsPct != null ? ` (${g.viewsPct > 0 ? '+' : ''}${g.viewsPct}%)` : ''), positive: g.viewsDelta >= 0 }
    : undefined

  const heroMetrics = [
    {
      label: 'Подписчики',
      value: loading ? '...' : fmtNumber(metrics?.totals.subscribers ?? 0),
      color: 'var(--accent)',
      growth: subsGrowth,
    },
    {
      label: 'Просмотры',
      value: loading ? '...' : fmtNumber(metrics?.totals.views ?? 0),
      color: 'var(--purple)',
      growth: viewsGrowth,
    },
    {
      label: 'Контент',
      value: loading ? '...' : fmtNumber(metrics?.totals.videos ?? 0),
      color: 'var(--text-primary)',
    },
    {
      label: 'Engagement',
      value: loading
        ? '...'
        : metrics?.totals.engagement != null ? metrics.totals.engagement.toFixed(2) + '%' : '--',
      color: 'var(--green)',
    },
  ]

  const nl = metrics?.newsletter
  const nlGrowthLabel = nl?.subscribersDelta != null
    ? `${nl.subscribersDelta > 0 ? '+' : ''}${nl.subscribersDelta}${nl.subscribersPct != null ? ` (${nl.subscribersPct > 0 ? '+' : ''}${nl.subscribersPct}%)` : ''}`
    : '—'

  return (
    <div className="px-6 py-8 md:px-10 md:py-10 max-w-7xl mx-auto">
      {/* Welcome header */}
      <div className="flex items-start justify-between gap-6 mb-8 flex-wrap">
        <WelcomeHero
          projectName={projectName}
          subtitle={loading
            ? 'Загружаем метрики…'
            : `${channels.length} канал${channels.length === 1 ? '' : channels.length < 5 ? 'а' : 'ов'} · будь в курсе прогресса и задач`}
        />
        {/* Period selector */}
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-surface border border-border">
          {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                period === p
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-cream'
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Hero Metrics */}
      <div className="mb-6">
        <HeroMetrics metrics={heroMetrics} />
      </div>

      {/* Newsletter delta banner */}
      {nl && nl.subscribers != null && (
        <Card className="mb-6 px-5 py-4 flex items-center gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Подписчики рассылки</div>
            <div className="text-2xl font-semibold text-foreground tabular-nums leading-none mt-1 tracking-tight">{nl.subscribers.toLocaleString('ru-RU')}</div>
          </div>
          <div className="flex-1" />
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">За {PERIOD_LABELS[period].toLowerCase()}</div>
            <div className={`text-sm font-medium tabular-nums mt-1 ${
              nl.subscribersDelta != null && nl.subscribersDelta < 0 ? 'text-red-500 dark:text-red-300' :
              nl.subscribersDelta != null && nl.subscribersDelta > 0 ? 'text-emerald-600 dark:text-emerald-300' :
              'text-muted-foreground'
            }`}>
              {nlGrowthLabel}
            </div>
          </div>
        </Card>
      )}

      {channels.length > 0 && (
        <>
          <div className="mb-5">
            <FilterTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
          </div>

          <div className="mb-6">
            <ChannelGrid channels={filteredChannels} />
          </div>
        </>
      )}

      {!loading && channels.length === 0 && (
        <div className="text-center py-16 text-muted text-sm">
          Нет каналов в этом проекте.{' '}
          <a href="/settings" className="text-accent underline">Добавить в настройках</a>
        </div>
      )}

      {/* Newsletter Widget (campaigns scoped to active project) */}
      <div className="mb-6">
        <NewsletterWidget projectId={projectId} />
      </div>

      {/* AI Insights */}
      <AiInsightsBar />
    </div>
  )
}
