'use client'

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
          className="bg-surface border border-border rounded-xl p-4 shadow-surface"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted mb-2">
            {m.label}
          </div>
          <div className="text-2xl font-semibold" style={{ color: m.color }}>
            {m.value}
          </div>
          {m.growth && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className={`text-[10px] ${m.growth.positive ? 'text-green' : 'text-warn'}`}>
                {m.growth.value}
              </span>
              <span className="text-[9px] text-dim">за месяц</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
