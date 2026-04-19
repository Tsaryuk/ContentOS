'use client'

import { ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Card } from '@/components/ui/card'

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
        <Card
          key={m.label}
          className="group p-5 hover:shadow-card-hover transition-shadow"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {m.label}
            </div>
            {m.growth && (
              <div
                className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  m.growth.positive
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                    : 'bg-red-500/10 text-red-600 dark:text-red-300'
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
            className="text-3xl font-semibold tabular-nums leading-none tracking-tight"
            style={{ color: m.color }}
          >
            {m.value}
          </div>
        </Card>
      ))}
    </div>
  )
}
