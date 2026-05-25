'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Severity = 'info' | 'warn' | 'accent' | 'purple'

interface Insight {
  key: string
  count: number
  label: string
  href: string
  severity: Severity
}

const BADGE_CLASS: Record<Severity, string> = {
  info:   'bg-muted/15 text-muted',
  warn:   'bg-warn/15 text-warn',
  accent: 'bg-accent/15 text-accent',
  purple: 'bg-purple/15 text-purple',
}

export function AiInsightsBar() {
  const [insights, setInsights] = useState<Insight[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch('/api/insights')
      .then((r) => r.json())
      .then((d: { insights?: Insight[] }) => {
        if (!alive) return
        if (Array.isArray(d.insights)) setInsights(d.insights)
      })
      .catch(() => { /* swallow — render empty bar */ })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  // While loading, render a stable skeleton so the bar doesn't pop
  // into existence after the dashboard is already painted.
  if (loading) {
    return (
      <div className="bg-surface/50 border border-border rounded-xl px-4 py-3 flex items-center gap-4 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">&#9889;</span>
          <span className="text-muted">AI Инсайты</span>
        </div>
        <div className="w-px h-4 bg-border" />
        <span className="text-dim animate-pulse">подгружаем…</span>
      </div>
    )
  }

  // Empty state — better to acknowledge silence than show a hard-coded
  // "everything is fine" string that ages badly.
  if (!insights || insights.length === 0) {
    return (
      <div className="bg-surface/50 border border-border rounded-xl px-4 py-3 flex items-center gap-4 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="text-sm">&#9889;</span>
          <span className="text-muted">AI Инсайты</span>
        </div>
        <div className="w-px h-4 bg-border" />
        <span className="text-dim">всё под контролем — ничего не требует внимания</span>
      </div>
    )
  }

  return (
    <div className="bg-surface/50 border border-border rounded-xl px-4 py-3 flex items-center gap-4 text-[11px] flex-wrap">
      <div className="flex items-center gap-1.5">
        <span className="text-sm">&#9889;</span>
        <span className="text-muted">AI Инсайты</span>
      </div>
      {insights.map((ins) => (
        <div key={ins.key} className="flex items-center gap-1.5">
          <div className="w-px h-4 bg-border" />
          <Link
            href={ins.href}
            className="flex items-center gap-1.5 text-muted hover:text-cream transition-colors"
          >
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded tabular-nums ${BADGE_CLASS[ins.severity]}`}>
              {ins.count}
            </span>
            <span>{ins.label}</span>
          </Link>
        </div>
      ))}
    </div>
  )
}
