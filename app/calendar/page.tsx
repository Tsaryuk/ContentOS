'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Loader2, Video, Send, Mail, FileText, ChevronLeft, ChevronRight } from 'lucide-react'

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

const KIND_META: Record<Kind, { icon: JSX.Element; label: string; dot: string }> = {
  video:      { icon: <Video      className="w-3 h-3" />, label: 'Видео',    dot: 'bg-red-400'     },
  telegram:   { icon: <Send       className="w-3 h-3" />, label: 'Telegram', dot: 'bg-sky-400'     },
  newsletter: { icon: <Mail       className="w-3 h-3" />, label: 'Email',    dot: 'bg-amber-400'   },
  article:    { icon: <FileText   className="w-3 h-3" />, label: 'Статья',   dot: 'bg-emerald-400' },
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function startOfCalendarGrid(d: Date): Date {
  const first = startOfMonth(d)
  // Monday = 1; shift so grid starts on Monday.
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-cream">
          {cursor.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
        </h1>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-muted" />}
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="p-2 rounded-lg bg-surface hover:bg-bg text-muted hover:text-cream"
            title="Предыдущий месяц"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCursor(startOfMonth(new Date()))}
            className="px-3 py-1.5 rounded-lg bg-surface text-xs text-muted hover:text-cream"
          >
            Сегодня
          </button>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="p-2 rounded-lg bg-surface hover:bg-bg text-muted hover:text-cream"
            title="Следующий месяц"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </header>

      {error && <p className="text-red-400 text-sm mb-4">Ошибка: {error}</p>}

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-px mb-1 text-[10px] text-dim uppercase tracking-wider">
        {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map(d => (
          <div key={d} className="px-2 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px rounded-lg overflow-hidden bg-border">
        {gridDays.map(day => {
          const key = ymd(day)
          const inMonth = day.getMonth() === cursorMonth
          const isToday = key === todayYmd
          const dayEvents = eventsByDay.get(key) ?? []
          return (
            <div
              key={key}
              className={`min-h-[110px] p-2 ${inMonth ? 'bg-surface' : 'bg-bg'} ${isToday ? 'ring-1 ring-accent ring-inset' : ''}`}
            >
              <div className={`text-xs mb-1 ${inMonth ? (isToday ? 'text-accent font-semibold' : 'text-cream') : 'text-dim'}`}>
                {day.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayEvents.slice(0, 4).map(e => {
                  const meta = KIND_META[e.kind]
                  const content = (
                    <div className="flex items-center gap-1 text-[11px] text-cream/90 hover:text-cream truncate">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${meta.dot} flex-shrink-0`} />
                      {meta.icon}
                      <span className="truncate">{e.title || '(без названия)'}</span>
                    </div>
                  )
                  return e.url ? (
                    <Link key={e.id} href={e.url} className="block">{content}</Link>
                  ) : (
                    <div key={e.id}>{content}</div>
                  )
                })}
                {dayEvents.length > 4 && (
                  <div className="text-[10px] text-dim">+{dayEvents.length - 4} ещё</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-muted">
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
