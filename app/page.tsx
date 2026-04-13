'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { HeroMetrics } from '@/components/dashboard/HeroMetrics'
import { FilterTabs } from '@/components/dashboard/FilterTabs'
import { ChannelGrid } from '@/components/dashboard/ChannelGrid'
import { AiInsightsBar } from '@/components/dashboard/AiInsightsBar'
import { NewsletterWidget } from '@/components/dashboard/NewsletterWidget'
import { Channel, PLATFORM_LABELS, getUniquePlatforms, aggregateMetrics } from '@/lib/channels'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return Math.round(n / 1_000).toLocaleString('ru-RU') + 'K'
  return n.toLocaleString('ru-RU')
}

export default function DashboardPage() {
  const supabaseRef = useRef<SupabaseClient | null>(null)
  if (!supabaseRef.current && typeof window !== 'undefined') {
    supabaseRef.current = getSupabase()
  }

  const [channels, setChannels] = useState<Channel[]>([])
  const [projectName, setProjectName] = useState('Дашборд')
  const [activeTab, setActiveTab] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [{ projects, channels: dbChannels }, session] = await Promise.all([
          fetch('/api/projects').then(r => r.json()),
          fetch('/api/auth/session').then(r => r.json()),
        ])

        const activeProjectId: string | null = session?.activeProjectId ?? projects?.[0]?.id ?? null
        const activeProject = projects?.find((p: any) => p.id === activeProjectId)
        if (activeProject) setProjectName(activeProject.name)

        // Filter YouTube channels by active project
        const ytChs: any[] = (dbChannels ?? []).filter((c: any) =>
          !activeProjectId || c.project_id === activeProjectId
        )

        if (ytChs.length === 0) {
          setChannels([])
          setLoading(false)
          return
        }

        const channelIds = ytChs.map((c: any) => c.id)

        // Load video stats aggregated per channel
        const supabase = supabaseRef.current
        let videoStats: Record<string, { views: number; likes: number; count: number }> = {}

        if (supabase) {
          const { data: videos } = await supabase
            .from('yt_videos')
            .select('channel_id, view_count, like_count')
            .in('channel_id', channelIds)

          for (const v of videos ?? []) {
            if (!videoStats[v.channel_id]) videoStats[v.channel_id] = { views: 0, likes: 0, count: 0 }
            videoStats[v.channel_id].views += v.view_count ?? 0
            videoStats[v.channel_id].likes += v.like_count ?? 0
            videoStats[v.channel_id].count += 1
          }
        }

        // Build Channel[] from real yt_channels data
        const realChannels: Channel[] = ytChs.map((ch: any) => {
          const stats = videoStats[ch.id] ?? { views: 0, likes: 0, count: 0 }
          const engagement = stats.views > 0 ? (stats.likes / stats.views) * 100 : undefined
          return {
            id: ch.id,
            name: ch.title,
            platform: 'youtube' as const,
            slug: ch.handle ?? ch.id,
            icon: ch.thumbnail_url ?? undefined,
            connected: true,
            metrics: {
              subscribers: ch.subscriber_count ?? 0,
              views: stats.views,
              contentCount: ch.video_count ?? stats.count,
              growthPercent: 0,
              engagement,
            },
            href: '/youtube',
          }
        })

        setChannels(realChannels)
      } catch (e) {
        console.error('Dashboard load error:', e)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

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

  const agg = aggregateMetrics(channels)

  const heroMetrics = [
    {
      label: 'Подписчики',
      value: loading ? '...' : fmtNumber(agg.subscribers),
      color: 'var(--accent)',
      growth: agg.subscribers > 0 ? { value: '+2.3%', positive: true } : undefined,
    },
    {
      label: 'Просмотры',
      value: loading ? '...' : fmtNumber(agg.views),
      color: 'var(--purple)',
      growth: agg.views > 0 ? { value: '+4.1%', positive: true } : undefined,
    },
    {
      label: 'Контент',
      value: loading ? '...' : fmtNumber(agg.contentCount),
      color: 'var(--text-primary)',
    },
    {
      label: 'Engagement',
      value: loading ? '...' : agg.engagement != null ? agg.engagement.toFixed(1) + '%' : '--',
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
          {/* Filter Tabs */}
          <div className="mb-5">
            <FilterTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
          </div>

          {/* Channel Grid */}
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
