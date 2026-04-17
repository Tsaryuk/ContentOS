'use client'

import { useEffect, useState } from 'react'
import { HeroMetrics } from '@/components/dashboard/HeroMetrics'
import { FilterTabs } from '@/components/dashboard/FilterTabs'
import { ChannelGrid } from '@/components/dashboard/ChannelGrid'
import { AiInsightsBar } from '@/components/dashboard/AiInsightsBar'
import { NewsletterWidget } from '@/components/dashboard/NewsletterWidget'
import { Channel, PLATFORM_LABELS, getUniquePlatforms } from '@/lib/channels'

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return Math.round(n / 1_000).toLocaleString('ru-RU') + 'K'
  return n.toLocaleString('ru-RU')
}

interface DashboardMetrics {
  channels: Array<{
    id: string
    title: string
    handle: string | null
    thumbnail_url: string | null
    subscribers: number
    views: number
    videos: number
    engagement: number | null
  }>
  totals: {
    subscribers: number
    views: number
    likes: number
    videos: number
    engagement: number | null
  }
  growth: {
    viewsPct: number | null
    videosDelta: number
  }
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [projectName, setProjectName] = useState('Дашборд')
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load(): Promise<void> {
      setLoading(true)
      try {
        const [metricsRes, projectsRes, sessionRes] = await Promise.all([
          fetch('/api/dashboard/metrics').then(r => r.json()),
          fetch('/api/projects').then(r => r.json()),
          fetch('/api/auth/session').then(r => r.json()),
        ])
        if (cancelled) return

        const activeProjectId: string | null = sessionRes?.activeProjectId ?? projectsRes?.projects?.[0]?.id ?? null
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
  }, [])

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
      growthPercent: 0,
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

  const growth = metrics?.growth
  const viewsGrowth = growth?.viewsPct !== null && growth?.viewsPct !== undefined
    ? { value: `${growth.viewsPct > 0 ? '+' : ''}${growth.viewsPct}%`, positive: growth.viewsPct >= 0 }
    : undefined

  const heroMetrics = [
    {
      label: 'Подписчики',
      value: loading ? '...' : fmtNumber(metrics?.totals.subscribers ?? 0),
      color: 'var(--accent)',
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

  return (
    <div className="px-6 py-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-cream">{projectName}</h1>
          <p className="text-[11px] text-muted mt-0.5">
            {loading ? 'Загрузка...' : `${channels.length} каналов`}
          </p>
        </div>
      </div>

      {/* Hero Metrics */}
      <div className="mb-6">
        <HeroMetrics metrics={heroMetrics} />
      </div>

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

      {/* Newsletter Widget */}
      <div className="mb-6">
        <NewsletterWidget />
      </div>

      {/* AI Insights */}
      <AiInsightsBar />
    </div>
  )
}
