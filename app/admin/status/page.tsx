'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity, ArrowLeft, CheckCircle, XCircle, AlertCircle,
  Loader2, RefreshCw,
} from 'lucide-react'

interface ServiceCheck {
  name: string
  status: 'ok' | 'error' | 'missing'
  detail?: string
}

const STATUS_META: Record<ServiceCheck['status'], {
  label: string
  dot: string
  text: string
  bg: string
}> = {
  ok:      { label: 'OK',          dot: 'bg-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-400/10' },
  error:   { label: 'Ошибка',       dot: 'bg-red-400',     text: 'text-red-300',     bg: 'bg-red-400/10' },
  missing: { label: 'Не настроен', dot: 'bg-amber-400',   text: 'text-amber-300',   bg: 'bg-amber-400/10' },
}

export default function AdminStatusPage() {
  const [services, setServices] = useState<ServiceCheck[]>([])
  const [loading, setLoading] = useState(false)
  const [timestamp, setTimestamp] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/health')
      const data = await res.json()
      setServices(data.services ?? [])
      setTimestamp(data.timestamp ?? null)
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const okCount = services.filter(s => s.status === 'ok').length
  const errorCount = services.filter(s => s.status === 'error').length
  const missingCount = services.filter(s => s.status === 'missing').length

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-xs text-muted hover:text-cream transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Админка
        </Link>
      </div>

      <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-300">
              <Activity className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-semibold text-cream">Состояние системы</h1>
          </div>
          <p className="text-sm text-muted ml-[52px]">
            Статус подключённых сервисов в реальном времени.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-surface text-xs font-medium text-muted hover:text-cream hover:border-accent/40 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {loading ? 'Проверяем…' : 'Перепроверить'}
        </button>
      </header>

      {services.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="text-[10px] uppercase tracking-wider text-dim mb-1">OK</div>
            <div className="text-2xl font-semibold text-emerald-300 tabular-nums">{okCount}</div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="text-[10px] uppercase tracking-wider text-dim mb-1">Ошибки</div>
            <div className="text-2xl font-semibold text-red-300 tabular-nums">{errorCount}</div>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="text-[10px] uppercase tracking-wider text-dim mb-1">Не настроены</div>
            <div className="text-2xl font-semibold text-amber-300 tabular-nums">{missingCount}</div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-400/10 border border-red-400/20 text-red-300 text-sm">
          Ошибка: {error}
        </div>
      )}

      {loading && services.length === 0 && (
        <div className="py-16 text-center text-muted text-sm">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-dim" />
          Проверяем сервисы…
        </div>
      )}

      {!loading && services.length === 0 && !error && (
        <div className="py-16 text-center text-muted text-sm">
          <Activity className="w-8 h-8 text-dim mx-auto mb-3" />
          Нет данных. Нажми «Перепроверить».
        </div>
      )}

      <div className="space-y-2.5">
        {services.map((svc, i) => {
          const meta = STATUS_META[svc.status]
          return (
            <div
              key={i}
              className="group flex items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-4 hover:border-accent/30 transition-colors"
            >
              <div className="shrink-0 w-10 h-10 rounded-xl bg-bg flex items-center justify-center">
                {svc.status === 'ok' && <CheckCircle className="w-5 h-5 text-emerald-300" />}
                {svc.status === 'error' && <XCircle className="w-5 h-5 text-red-300" />}
                {svc.status === 'missing' && <AlertCircle className="w-5 h-5 text-amber-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-cream">{svc.name}</div>
                {svc.detail && (
                  <div className="text-xs text-muted truncate mt-0.5">{svc.detail}</div>
                )}
              </div>
              <div className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium ${meta.bg} ${meta.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </div>
            </div>
          )
        })}
      </div>

      {timestamp && (
        <p className="text-[11px] text-dim text-right mt-6">
          Проверено: {new Date(timestamp).toLocaleString('ru-RU')}
        </p>
      )}
    </div>
  )
}
