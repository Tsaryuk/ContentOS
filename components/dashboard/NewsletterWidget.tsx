'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Mail, Users, Eye, MousePointer, TrendingUp, TrendingDown } from 'lucide-react'

interface CampaignSummary {
  issue: { subject: string; issue_number: number | null; sent_at: string } | null
  open_rate: number
  click_rate: number
  total_sent: number
  total_opened: number
  total_clicked: number
  total_unsubscribed: number
}

interface StatsData {
  subscriber_count: number
  campaigns: CampaignSummary[]
}

export function NewsletterWidget() {
  const [data, setData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/newsletter/stats')
        const json = await res.json()
        if (!json.error) setData(json)
      } catch { /* ignore if not configured */ }
      setLoading(false)
    }
    load()
  }, [])

  if (loading || !data) return null

  const last = data.campaigns[0]
  const prev = data.campaigns[1]

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-cream">Рассылка</span>
        </div>
        <Link href="/newsletter" className="text-[10px] text-accent hover:underline">
          Все выпуски
        </Link>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div className="flex items-center gap-1.5 text-dim mb-1">
            <Users className="w-3 h-3" />
            <span className="text-[10px] uppercase tracking-wider">Подписчики</span>
          </div>
          <div className="text-lg font-semibold text-cream">
            {data.subscriber_count.toLocaleString()}
          </div>
        </div>
        {last && (
          <>
            <div>
              <div className="flex items-center gap-1.5 text-dim mb-1">
                <Eye className="w-3 h-3" />
                <span className="text-[10px] uppercase tracking-wider">Open Rate</span>
              </div>
              <div className="text-lg font-semibold text-cream flex items-center gap-1">
                {last.open_rate}%
                {prev && (
                  last.open_rate >= prev.open_rate
                    ? <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                    : <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                )}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-dim mb-1">
                <MousePointer className="w-3 h-3" />
                <span className="text-[10px] uppercase tracking-wider">Click Rate</span>
              </div>
              <div className="text-lg font-semibold text-cream">
                {last.click_rate}%
              </div>
            </div>
          </>
        )}
      </div>

      {/* Last campaign */}
      {last?.issue && (
        <div className="border-t border-border/50 pt-3">
          <div className="text-[10px] text-dim uppercase tracking-wider mb-1.5">Последний выпуск</div>
          <div className="text-xs text-cream truncate">{last.issue.subject}</div>
          <div className="text-[10px] text-dim mt-0.5">
            {new Date(last.issue.sent_at).toLocaleDateString('ru-RU', {
              day: 'numeric', month: 'short', year: 'numeric',
            })}
            {' '}&middot;{' '}
            Отправлено: {last.total_sent.toLocaleString()}
            {' '}&middot;{' '}
            Открыто: {last.total_opened.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  )
}
