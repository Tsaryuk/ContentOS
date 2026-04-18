'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, ArrowLeft } from 'lucide-react'
import { labelTask, labelProvider } from '@/lib/cost-labels'

interface ByKey {
  key: string
  count: number
  cost: number
  inputTokens?: number
  outputTokens?: number
  units?: number
  name?: string
  color?: string | null
}

interface CostReport {
  days: number
  totalEvents: number
  eventsWithCost: number
  totalCostUsd: number
  byDay: { day: string; cost: number }[]
  byProvider: ByKey[]
  byTask: ByKey[]
  byModel: ByKey[]
  byProject: ByKey[]
  recent: {
    provider: string; model: string; task: string | null;
    cost_usd: number | null; created_at: string; video_id: string | null;
    input_tokens: number | null; output_tokens: number | null; units: number | null
  }[]
}

const RANGES = [
  { label: 'Сегодня', days: 1 },
  { label: '7 дней', days: 7 },
  { label: '30 дней', days: 30 },
  { label: '90 дней', days: 90 },
  { label: '180 дней', days: 180 },
]

export default function CostsPage() {
  const [days, setDays] = useState(30)
  const [report, setReport] = useState<CostReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setError(null)
    fetch(`/api/admin/costs?days=${days}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => { if (!cancelled) setReport(data) })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [days])

  if (error) {
    return <div className="p-8 max-w-6xl mx-auto"><p className="text-red-400">Ошибка: {error}</p></div>
  }

  if (!report) {
    return (
      <div className="p-8 max-w-6xl mx-auto flex items-center gap-2 text-muted">
        <Loader2 className="w-4 h-4 animate-spin" /> Загрузка...
      </div>
    )
  }

  const maxDayCost = Math.max(...report.byDay.map(d => d.cost), 0.0001)
  const coverage = report.totalEvents ? Math.round(report.eventsWithCost / report.totalEvents * 100) : 0

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="p-2 rounded-lg bg-surface hover:bg-bg/70 text-muted hover:text-cream">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-cream">Стоимость AI</h1>
            <p className="text-sm text-muted mt-1">
              {report.totalEvents.toLocaleString('ru-RU')} событий · покрытие ценой {coverage}%
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {RANGES.map(r => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                days === r.days ? 'bg-accent text-white' : 'bg-surface text-muted hover:text-cream'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <section className="rounded-xl border border-border bg-surface p-6">
        <div className="text-xs text-dim uppercase tracking-wider mb-1">Всего за период</div>
        <div className="text-4xl font-semibold text-cream tabular-nums">
          ${report.totalCostUsd.toFixed(2)}
        </div>
        <div className="text-xs text-muted mt-1">
          ≈ ${(report.totalCostUsd / Math.max(report.days, 1)).toFixed(2)} / день
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted mb-3">По дням</h2>
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="flex items-end gap-1 h-32">
            {report.byDay.map(d => (
              <div
                key={d.day}
                className="flex-1 bg-accent/60 rounded-t hover:bg-accent transition-colors min-w-[4px]"
                style={{ height: `${(d.cost / maxDayCost) * 100}%` }}
                title={`${d.day}: $${d.cost.toFixed(4)}`}
              />
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-dim mt-2">
            <span>{report.byDay[0]?.day ?? ''}</span>
            <span>{report.byDay[report.byDay.length - 1]?.day ?? ''}</span>
          </div>
        </div>
      </section>

      {/* Projects — full-width card so colours are easy to scan */}
      {report.byProject.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted mb-3">По проектам</h2>
          <div className="rounded-xl border border-border bg-surface p-4 space-y-2">
            {report.byProject.map(pr => {
              const total = report.byProject.reduce((s, p) => s + p.cost, 0) || 1
              const pct = (pr.cost / total) * 100
              return (
                <div key={pr.key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="flex items-center gap-2 text-cream">
                      <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ background: pr.color ?? 'var(--dim)' }}
                      />
                      {pr.name ?? pr.key}
                    </span>
                    <span className="text-muted tabular-nums">${pr.cost.toFixed(2)} · {pr.count} событий</span>
                  </div>
                  <div className="h-1.5 rounded bg-bg">
                    <div
                      className="h-full rounded"
                      style={{ width: `${pct}%`, background: pr.color ?? 'var(--accent)' }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <Breakdown
          title="По задаче"
          rows={report.byTask.map(r => ({ ...r, key: labelTask(r.key) }))}
        />
        <Breakdown
          title="По провайдеру"
          rows={report.byProvider.map(r => ({ ...r, key: labelProvider(r.key) }))}
        />
        <Breakdown title="По модели" rows={report.byModel} showTokens />
      </div>

      <section>
        <h2 className="text-sm font-medium text-muted mb-3">Последние 50 событий</h2>
        <div className="rounded-xl border border-border bg-surface overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-dim uppercase tracking-wider">
                <th className="text-left px-3 py-2">Время</th>
                <th className="text-left px-3 py-2">Задача</th>
                <th className="text-left px-3 py-2">Провайдер</th>
                <th className="text-left px-3 py-2">Модель</th>
                <th className="text-right px-3 py-2">In</th>
                <th className="text-right px-3 py-2">Out</th>
                <th className="text-right px-3 py-2">Units</th>
                <th className="text-right px-3 py-2">$</th>
              </tr>
            </thead>
            <tbody>
              {report.recent.map((r, i) => (
                <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-bg/40">
                  <td className="px-3 py-2 text-dim whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString('ru-RU', {
                      month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-3 py-2 text-cream">{labelTask(r.task)}</td>
                  <td className="px-3 py-2 text-muted">{labelProvider(r.provider)}</td>
                  <td className="px-3 py-2 text-muted text-[10px]">{r.model}</td>
                  <td className="px-3 py-2 text-right text-muted tabular-nums">{r.input_tokens ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-muted tabular-nums">{r.output_tokens ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-muted tabular-nums">{r.units ?? '—'}</td>
                  <td className="px-3 py-2 text-right text-cream tabular-nums">
                    {r.cost_usd !== null ? `$${Number(r.cost_usd).toFixed(4)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

interface BreakdownProps { title: string; rows: ByKey[]; showTokens?: boolean }

function Breakdown({ title, rows, showTokens }: BreakdownProps) {
  const total = rows.reduce((s, r) => s + r.cost, 0) || 1
  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h3 className="text-xs font-medium text-dim uppercase tracking-wider mb-3">{title}</h3>
      <div className="space-y-2">
        {rows.slice(0, 10).map(r => {
          const pct = (r.cost / total) * 100
          return (
            <div key={r.key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-cream truncate pr-2">{r.key}</span>
                <span className="text-muted tabular-nums">${r.cost.toFixed(2)}</span>
              </div>
              <div className="h-1 rounded bg-bg">
                <div className="h-full bg-accent rounded" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-[10px] text-dim mt-0.5 tabular-nums">
                {r.count} событий
                {showTokens && r.inputTokens !== undefined && (r.inputTokens > 0 || (r.outputTokens ?? 0) > 0) && (
                  <> · {r.inputTokens.toLocaleString()} in / {(r.outputTokens ?? 0).toLocaleString()} out</>
                )}
                {showTokens && (r.units ?? 0) > 0 && (<> · {r.units} units</>)}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
