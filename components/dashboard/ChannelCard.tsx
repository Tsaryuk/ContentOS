'use client'

import Link from 'next/link'
import { Channel } from '@/lib/channels'
import { PLATFORM_ICONS } from '@/components/layout/Sidebar'

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

export function ChannelCard({ channel }: { channel: Channel }) {
  if (!channel.connected || !channel.metrics) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 opacity-60 cursor-pointer hover:border-muted/20 transition-colors">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-4 h-4 text-muted">{PLATFORM_ICONS[channel.platform]}</span>
          <span className="text-xs font-medium text-cream">{channel.name}</span>
          <span className="ml-auto text-[9px] bg-surface border border-border text-dim px-1.5 py-0.5 rounded">
            скоро
          </span>
        </div>
        <div className="text-sm text-dim text-center py-2">API не подключён</div>
        <div className="text-[9px] text-dim text-center mt-1.5">Нажмите для настройки</div>
      </div>
    )
  }

  return (
    <Link href={channel.href}>
      <div className="bg-surface border border-border rounded-xl p-4 cursor-pointer hover:border-muted/30 transition-colors">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-4 h-4 text-muted">{PLATFORM_ICONS[channel.platform]}</span>
          <span className="text-xs font-medium text-cream">{channel.name}</span>
          {channel.metrics.growthPercent !== 0 && (
            <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded ${
              channel.metrics.growthPercent > 0
                ? 'bg-green/10 text-green'
                : 'bg-warn/10 text-warn'
            }`}>
              {channel.metrics.growthPercent > 0 ? '+' : ''}{channel.metrics.growthPercent}%
            </span>
          )}
        </div>
        <div className="flex gap-4">
          <div>
            <div className="text-lg font-semibold text-accent">
              {fmtNumber(channel.metrics.subscribers)}
            </div>
            <div className="text-[9px] text-dim">подписчики</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-cream/70">
              {fmtNumber(channel.metrics.views)}
            </div>
            <div className="text-[9px] text-dim">просмотры</div>
          </div>
        </div>
        <div className="mt-2.5 text-[9px] text-dim">
          {channel.metrics.contentCount} публикаций &bull; Подключено
        </div>
      </div>
    </Link>
  )
}
