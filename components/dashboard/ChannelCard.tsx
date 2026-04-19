'use client'

import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Channel } from '@/lib/channels'
import { PLATFORM_ICONS } from '@/lib/platform-icons'

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

export function ChannelCard({ channel }: { channel: Channel }) {
  if (!channel.connected || !channel.metrics) {
    return (
      <div className="bg-surface border border-border rounded-2xl p-5 opacity-60 cursor-pointer hover:border-muted/20 transition-colors">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-4 h-4 text-muted">{PLATFORM_ICONS[channel.platform]}</span>
          <span className="text-sm font-medium text-cream truncate">{channel.name}</span>
          <span className="ml-auto text-[9px] bg-bg border border-border text-dim px-2 py-0.5 rounded-full">
            скоро
          </span>
        </div>
        <div className="text-sm text-dim text-center py-3">API не подключён</div>
        <div className="text-[10px] text-dim text-center">Нажмите для настройки</div>
      </div>
    )
  }

  const g = channel.metrics.growthPercent
  const positive = g > 0

  return (
    <Link href={channel.href} className="block group">
      <div className="bg-surface border border-border rounded-2xl p-5 hover:border-accent/30 transition-colors">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-4 h-4 text-muted">{PLATFORM_ICONS[channel.platform]}</span>
          <span className="text-sm font-medium text-cream truncate">{channel.name}</span>
          {g !== 0 && (
            <span
              className={`ml-auto inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                positive ? 'bg-emerald-400/10 text-emerald-300' : 'bg-red-400/10 text-red-300'
              }`}
            >
              {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {positive ? '+' : ''}{g}%
            </span>
          )}
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold text-accent tabular-nums leading-none">
              {fmtNumber(channel.metrics.subscribers)}
            </div>
            <div className="text-[10px] text-dim mt-1.5">подписчики</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-medium text-cream/80 tabular-nums leading-none">
              {fmtNumber(channel.metrics.views)}
            </div>
            <div className="text-[10px] text-dim mt-1.5">просмотры</div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-border/60 text-[10px] text-dim flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/70" />
          {channel.metrics.contentCount} публикаций · Подключено
        </div>
      </div>
    </Link>
  )
}
