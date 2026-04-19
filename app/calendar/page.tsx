'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, Video, Send, Mail, FileText, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Kind = 'video' | 'telegram' | 'newsletter' | 'article'

interface CalendarEvent {
  id: string
  kind: Kind
  title: string
  at: string
  status: string
  channel?: string
  url?: string
  thumbnail?: string | null
}

const KIND_META: Record<Kind, { icon: JSX.Element; label: string; dot: string; tint: string }> = {
  video:      { icon: <Video    className="w-3 h-3" />, label: 'Видео',    dot: 'bg-red-500',     tint: 'text-red-500/80'     },
  telegram:   { icon: <Send     className="w-3 h-3" />, label: 'Telegram', dot: 'bg-sky-500',     tint: 'text-sky-500/80'     },
  newsletter: { icon: <Mail     className="w-3 h-3" />, label: 'Email',    dot: 'bg-amber-500',   tint: 'text-amber-500/80'   },
  article:    { icon: <FileText className="w-3 h-3" />, label: 'Статья',   dot: 'bg-emerald-500', tint: 'text-emerald-500/80' },
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function startOfCalendarGrid(d: Date): Date {
  const first = startOfMonth(d)
  const day = (first.getDay() + 6) % 7
  return new Date(first.getFullYear(), first.getMonth(), 1 - day)
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState<Date>(() => startOfMonth(new Date()))
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const gridStart = useMemo(() => startOfCalendarGrid(cursor), [cursor])
  const gridDays = useMemo(
    () => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)),
    [gridStart],
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const from = ymd(gridStart)
    const to = ymd(addDays(gridStart, 41))
    fetch(`/api/calendar?from=${from}&to=${to}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(d => { if (!cancelled) { setEvents(d.events ?? []); setLoading(false) } })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false) } })
    return () => { cancelled = true }
  }, [gridStart])

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const day = e.at.slice(0, 10)
      const arr = map.get(day) ?? []
      arr.push(e)
      map.set(day, arr)
    }
    return map
  }, [events])

  const todayYmd = ymd(new Date())
  const cursorMonth = cursor.getMonth()
  const monthLabel = cursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })
  const monthLabelCap = monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2 uppercase tracking-wider">
            <span>ContentOS</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="normal-case tracking-normal">Публикации</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight">
            {monthLabelCap}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Видео · Telegram · рассылка · статьи — всё в одном расписании.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} title="Предыдущий месяц">
            <ChevronLeft />
          </Button>
          <Button variant="secondary" onClick={() => setCursor(startOfMonth(new Date()))}>Сегодня</Button>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} title="Следующий месяц">
            <ChevronRight />
          </Button>
        </div>
      </header>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-300 text-sm">
          Ошибка: {error}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-card">
        {/* Weekday labels */}
        <div className="grid grid-cols-7 bg-muted/30 text-[10px] text-muted-foreground uppercase tracking-wider border-b border-border">
          {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(d => (
            <div key={d} className="px-3 py-2 text-center">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 bg-border/60 gap-px">
          {gridDays.map(day => {
            const key = ymd(day)
            const inMonth = day.getMonth() === cursorMonth
            const isToday = key === todayYmd
            const dayEvents = eventsByDay.get(key) ?? []
            return (
              <div
                key={key}
                className={`min-h-[110px] p-2 transition-colors ${
                  inMonth ? 'bg-card' : 'bg-muted/20'
                } ${isToday ? 'ring-2 ring-accent ring-inset' : ''}`}
              >
                <div className={`text-xs mb-1 tabular-nums ${
                  !inMonth
                    ? 'text-muted-foreground/60'
                    : isToday
                      ? 'text-accent font-semibold'
                      : 'text-foreground'
                }`}>
                  {day.getDate()}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 4).map(e => {
                    const meta = KIND_META[e.kind]
                    const content = (
                      <div className="group/event flex items-center gap-1 text-[11px] text-foreground/80 hover:text-foreground truncate">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${meta.dot} shrink-0`} />
                        <span className={`${meta.tint} shrink-0`}>{meta.icon}</span>
                        <span className="truncate">{e.title || '(без названия)'}</span>
                      </div>
                    )
                    return e.url
                      ? <Link key={e.id} href={e.url} className="block">{content}</Link>
                      : <div key={e.id}>{content}</div>
                  })}
                  {dayEvents.length > 4 && (
                    <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 4} ещё</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground flex-wrap">
        {Object.entries(KIND_META).map(([k, m]) => (
          <div key={k} className="flex items-center gap-1.5">
            <span className={`inline-block w-2 h-2 rounded-full ${m.dot}`} />
            {m.label}
          </div>
        ))}
      </div>
    </div>
  )
}
