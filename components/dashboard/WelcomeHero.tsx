'use client'

import { useEffect, useState } from 'react'

function greeting(hour: number): string {
  if (hour < 5) return 'Доброй ночи'
  if (hour < 12) return 'Доброе утро'
  if (hour < 18) return 'Добрый день'
  return 'Добрый вечер'
}

function firstName(name: string | null | undefined): string {
  if (!name) return ''
  return name.split(/\s+/)[0] ?? ''
}

export function WelcomeHero({
  projectName,
  subtitle,
}: {
  projectName: string
  subtitle: string
}) {
  const [userName, setUserName] = useState<string | null>(null)
  const [hour, setHour] = useState<number>(() => new Date().getHours())

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/session')
      .then(r => r.json())
      .then(d => { if (!cancelled) setUserName(d.userName ?? null) })
      .catch(() => undefined)
    const t = setInterval(() => setHour(new Date().getHours()), 60_000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  const name = firstName(userName)
  const hello = name ? `${greeting(hour)}, ${name}` : greeting(hour)

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 text-[11px] text-dim mb-2 uppercase tracking-wider">
        <span>ContentOS</span>
        <span className="w-1 h-1 rounded-full bg-dim" />
        <span className="normal-case tracking-normal text-muted">{projectName}</span>
      </div>
      <h1 className="text-3xl md:text-4xl font-semibold text-cream leading-tight">
        {hello}
      </h1>
      <p className="text-sm text-muted mt-2">{subtitle}</p>
    </div>
  )
}
