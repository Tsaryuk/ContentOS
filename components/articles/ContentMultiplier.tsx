// Single-screen view of what's been produced from this article and what's
// still missing. Renders 7 status pills (email, threads, video-script,
// carousel, tg-post, clip, podcast) — each clickable to either jump to
// the existing piece or to the relevant creation surface.
//
// The point isn't to replicate the dedicated pages — it's the "at-a-glance"
// answer to "did I fully squeeze this article".

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import {
  Mail, MessageSquare, Video, Image as ImageIcon, Send, Scissors,
  Headphones, Loader2, Check, Circle, CheckCircle2,
} from 'lucide-react'

type Kind = 'email' | 'threads' | 'video_script' | 'carousel' | 'tg_post' | 'clip' | 'podcast'
type Status = 'missing' | 'draft' | 'ready' | 'sent'

interface Item {
  kind: Kind
  status: Status
  hint?: string
  href: string | null
  available: boolean
}

interface Props {
  articleId: string
}

const KIND_META: Record<Kind, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  email:        { label: 'Email',           icon: Mail },
  threads:      { label: 'Threads',         icon: MessageSquare },
  video_script: { label: 'Video-сценарий',  icon: Video },
  carousel:     { label: 'Карусель',        icon: ImageIcon },
  tg_post:      { label: 'Telegram',        icon: Send },
  clip:         { label: 'Клипы',           icon: Scissors },
  podcast:      { label: 'Подкаст',         icon: Headphones },
}

function statusBadge(status: Status, available: boolean): { label: string; cls: string; Icon: React.ComponentType<{ className?: string }> } {
  if (!available) return { label: 'Нет видео', cls: 'text-muted-foreground/40 border-border', Icon: Circle }
  switch (status) {
    case 'sent':    return { label: 'Готово',  cls: 'text-emerald-500 border-emerald-500/30 bg-emerald-500/5',  Icon: CheckCircle2 }
    case 'ready':   return { label: 'Готов',   cls: 'text-blue-500 border-blue-500/30 bg-blue-500/5',           Icon: Check }
    case 'draft':   return { label: 'Черновик', cls: 'text-amber-500 border-amber-500/30 bg-amber-500/5',       Icon: Circle }
    case 'missing': return { label: 'Нет',     cls: 'text-muted-foreground/60 border-border',                  Icon: Circle }
  }
}

export function ContentMultiplier({ articleId }: Props) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetch(`/api/articles/${articleId}/multiplier`)
      .then((r) => r.json())
      .then((d: { items: Item[] }) => {
        if (!alive) return
        if (Array.isArray(d.items)) setItems(d.items)
      })
      .catch(() => { /* leave items null */ })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [articleId])

  if (loading || !items) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-medium text-foreground">Контент из статьи</span>
          <Loader2 className="w-3 h-3 animate-spin text-muted-foreground/60" />
        </div>
      </Card>
    )
  }

  // Sort: sent first, then ready, then draft, then missing, then unavailable.
  // Within group, keep declared order so layout doesn't shuffle every render.
  const sortKey: Record<Status, number> = { sent: 0, ready: 1, draft: 2, missing: 3 }
  const sorted = [...items].sort((a, b) => {
    if (!a.available && b.available) return 1
    if (a.available && !b.available) return -1
    return sortKey[a.status] - sortKey[b.status]
  })
  const doneCount = items.filter((i) => i.status === 'sent' || i.status === 'ready').length
  const availableCount = items.filter((i) => i.available).length

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-medium text-foreground">Контент из статьи</div>
        <div className="text-[10px] text-muted-foreground/60 tabular-nums">
          {doneCount}/{availableCount}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {sorted.map((it) => {
          const { label } = KIND_META[it.kind]
          const Icon = KIND_META[it.kind].icon
          const b = statusBadge(it.status, it.available)
          const StatusIcon = b.Icon
          const body = (
            <div className={`flex items-center gap-2 px-2 py-1.5 rounded border text-[11px] transition-colors ${b.cls} ${it.href ? 'hover:bg-accent-surface cursor-pointer' : 'cursor-default'}`}>
              <Icon className="w-3 h-3 shrink-0" />
              <span className="flex-1 truncate text-foreground/90">{label}</span>
              <StatusIcon className="w-3 h-3 shrink-0" />
            </div>
          )
          return it.href && it.available ? (
            <Link key={it.kind} href={it.href} title={it.hint}>
              {body}
            </Link>
          ) : (
            <div key={it.kind} title={it.hint ?? (it.available ? '' : 'Нужна привязанная YouTube-ссылка')}>
              {body}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
