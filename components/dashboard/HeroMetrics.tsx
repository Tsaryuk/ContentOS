'use client'

import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

type Metric = {
  label: string
  value: string
  color: string
  growth?: { value: string; positive: boolean }
}

export function HeroMetrics({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {metrics.map(m => (
        <div
          key={m.label}
          className="group relative bg-surface border border-border rounded-2xl p-5 hover:border-accent/30 transition-colors"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-wider text-dim">
              {m.label}
            </div>
            {m.growth && (
              <div
                className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  m.growth.positive
                    ? 'bg-emerald-400/10 text-emerald-300'
                    : 'bg-red-400/10 text-red-300'
                }`}
              >
                {m.growth.positive
                  ? <ArrowUpRight className="w-3 h-3" />
                  : <ArrowDownRight className="w-3 h-3" />}
                {m.growth.value}
              </div>
            )}
          </div>
          <div
            className="text-3xl font-semibold tabular-nums leading-none"
            style={{ color: m.color }}
          >
            {m.value}
          </div>
        </div>
      ))}
    </div>
  )
}
