'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Activity, ArrowLeft, CheckCircle, XCircle, AlertCircle,
  Loader2, RefreshCw,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
  ok:      { label: 'OK',          dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-300', bg: 'bg-emerald-500/10' },
  error:   { label: 'Ошибка',       dot: 'bg-red-500',     text: 'text-red-600 dark:text-red-300',         bg: 'bg-red-500/10' },
  missing: { label: 'Не настроен', dot: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-300',     bg: 'bg-amber-500/10' },
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
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Админка
        </Link>
      </div>

      <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-11 h-11 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-500 dark:text-sky-300">
              <Activity className="w-5 h-5" />
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold text-foreground tracking-tight">Состояние системы</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-[56px]">
            Статус подключённых сервисов в реальном времени.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          {loading ? 'Проверяем…' : 'Перепроверить'}
        </Button>
      </header>

      {services.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="p-5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">OK</div>
            <div className="text-3xl font-semibold text-emerald-600 dark:text-emerald-300 tabular-nums tracking-tight">{okCount}</div>
          </Card>
          <Card className="p-5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Ошибки</div>
            <div className="text-3xl font-semibold text-red-600 dark:text-red-300 tabular-nums tracking-tight">{errorCount}</div>
          </Card>
          <Card className="p-5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Не настроены</div>
            <div className="text-3xl font-semibold text-amber-600 dark:text-amber-300 tabular-nums tracking-tight">{missingCount}</div>
          </Card>
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-300 text-sm">
          Ошибка: {error}
        </div>
      )}

      {loading && services.length === 0 && (
        <div className="py-16 text-center text-muted-foreground text-sm">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
          Проверяем сервисы…
        </div>
      )}

      {!loading && services.length === 0 && !error && (
        <div className="py-16 text-center text-muted-foreground text-sm">
          <Activity className="w-8 h-8 mx-auto mb-3 opacity-50" />
          Нет данных. Нажми «Перепроверить».
        </div>
      )}

      <div className="space-y-2.5">
        {services.map((svc, i) => {
          const meta = STATUS_META[svc.status]
          return (
            <Card
              key={i}
              className="group flex items-center gap-4 px-5 py-4 hover:shadow-card-hover transition-shadow"
            >
              <div className="shrink-0 w-10 h-10 rounded-xl bg-muted/40 flex items-center justify-center">
                {svc.status === 'ok' && <CheckCircle className="w-5 h-5 text-emerald-500 dark:text-emerald-300" />}
                {svc.status === 'error' && <XCircle className="w-5 h-5 text-red-500 dark:text-red-300" />}
                {svc.status === 'missing' && <AlertCircle className="w-5 h-5 text-amber-500 dark:text-amber-300" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground">{svc.name}</div>
                {svc.detail && (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">{svc.detail}</div>
                )}
              </div>
              <div className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium ${meta.bg} ${meta.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                {meta.label}
              </div>
            </Card>
          )
        })}
      </div>

      {timestamp && (
        <p className="text-[11px] text-muted-foreground text-right mt-6">
          Проверено: {new Date(timestamp).toLocaleString('ru-RU')}
        </p>
      )}
    </div>
  )
}
