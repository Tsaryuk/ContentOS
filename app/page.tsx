'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { CHANNELS, Channel, aggregateMetrics, getUniquePlatforms, PLATFORM_LABELS } from '@/lib/channels'
import { HeroMetrics } from '@/components/dashboard/HeroMetrics'
import { FilterTabs } from '@/components/dashboard/FilterTabs'
import { ChannelGrid } from '@/components/dashboard/ChannelGrid'
import { AiInsightsBar } from '@/components/dashboard/AiInsightsBar'

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

  const [channels, setChannels] = useState<Channel[]>(CHANNELS)
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    async function loadYouTubeStats() {
      const supabase = supabaseRef.current
      if (!supabase) return

      const { data: videos } = await supabase
        .from('yt_videos')
        .select('view_count, like_count, duration_seconds')

      if (!videos || videos.length === 0) return

      const totalViews = videos.reduce((s, v) => s + (v.view_count || 0), 0)
      const totalLikes = videos.reduce((s, v) => s + (v.like_count || 0), 0)
      const engagement = totalViews > 0 ? (totalLikes / totalViews) * 100 : undefined

      // For now, put all YT stats on the main channel
      setChannels(prev => prev.map(ch => {
        if (ch.id === 'yt-lichnaya-filosofiya') {
          return {
            ...ch,
            metrics: {
              subscribers: 66100,
              views: totalViews,
              contentCount: videos.length,
              growthPercent: 1.8,
              engagement,
            },
          }
        }
        return ch
      }))
    }

    loadYouTubeStats()
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

  // NOTE: Growth percentages are hardcoded placeholders.
  // Real growth calculation requires storing historical snapshots (future feature).
  const heroMetrics = [
    {
      label: 'Подписчики',
      value: fmtNumber(agg.subscribers),
      color: 'var(--accent)',
      growth: agg.subscribers > 0 ? { value: '+2.3%', positive: true } : undefined,
    },
    {
      label: 'Просмотры',
      value: fmtNumber(agg.views),
      color: 'var(--purple)',
      growth: agg.views > 0 ? { value: '+4.1%', positive: true } : undefined,
    },
    {
      label: 'Контент',
      value: fmtNumber(agg.contentCount),
      color: 'var(--text-primary)',
    },
    {
      label: 'Engagement',
      value: agg.engagement != null ? agg.engagement.toFixed(1) + '%' : '--',
      color: 'var(--green)',
      growth: agg.engagement != null ? { value: '-0.2%', positive: false } : undefined,
    },
  ]

  return (
    <div className="px-6 py-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-cream">Денис Царюк</h1>
          <p className="text-[11px] text-muted mt-0.5">
            Медиа &bull; {channels.length} каналов &bull; {platforms.length} платформ
          </p>
        </div>
        <div className="text-[10px] text-dim bg-surface border border-border px-2.5 py-1 rounded-md">
          Обновлено 5 мин назад
        </div>
      </div>

      {/* Hero Metrics */}
      <div className="mb-6">
        <HeroMetrics metrics={heroMetrics} />
      </div>

      {/* Filter Tabs */}
      <div className="mb-5">
        <FilterTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Channel Grid */}
      <div className="mb-6">
        <ChannelGrid channels={filteredChannels} />
      </div>

      {/* AI Insights */}
      <AiInsightsBar />
    </div>
  )
}
