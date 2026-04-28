'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Play, Send, Camera, Globe } from 'lucide-react'
import { Card } from '@/components/ui/card'

interface YtChannel {
  id: string
  title: string
  handle: string | null
  thumbnail_url: string | null
  subscriber_count: number | null
  needs_reauth: boolean | null
}

const PLATFORMS = [
  { key: 'youtube', label: 'YouTube', enabled: true, icon: <Play className="w-4 h-4" /> },
  { key: 'telegram', label: 'Telegram', enabled: false, icon: <Send className="w-4 h-4" /> },
  { key: 'instagram', label: 'Instagram', enabled: false, icon: <Camera className="w-4 h-4" /> },
  { key: 'website', label: 'Сайт', enabled: false, icon: <Globe className="w-4 h-4" /> },
] as const

export default function CommentsPage() {
  const [channels, setChannels] = useState<YtChannel[]>([])
  const [activePlatform, setActivePlatform] = useState<string>('youtube')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => {
        setChannels(data.channels ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Комментарии</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Автоматические ответы в твоём тоне, по соцсетям и каналам.
        </p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-border">
        {PLATFORMS.map((p) => (
          <button
            key={p.key}
            onClick={() => p.enabled && setActivePlatform(p.key)}
            disabled={!p.enabled}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activePlatform === p.key
                ? 'border-accent text-accent'
                : p.enabled
                  ? 'border-transparent text-muted-foreground hover:text-foreground'
                  : 'border-transparent text-muted-foreground/40 cursor-not-allowed'
            }`}
          >
            {p.icon}
            {p.label}
            {!p.enabled && (
              <span className="text-[9px] uppercase tracking-wider bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                скоро
              </span>
            )}
          </button>
        ))}
      </div>

      {activePlatform === 'youtube' && (
        <YoutubeChannelGrid channels={channels} loading={loading} />
      )}
    </div>
  )
}

function YoutubeChannelGrid({
  channels,
  loading,
}: {
  channels: YtChannel[]
  loading: boolean
}) {
  if (loading) {
    return <div className="text-sm text-muted-foreground">Загружаем каналы...</div>
  }

  if (channels.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-sm text-muted-foreground">
          Нет подключённых YouTube-каналов.{' '}
          <Link href="/settings" className="text-accent underline">
            Подключить
          </Link>
        </div>
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {channels.map((c) => (
        <Link key={c.id} href={`/comments/youtube/${c.id}`} className="block group">
          <Card className="p-5 hover:shadow-card-hover transition-shadow">
            <div className="flex items-center gap-3 mb-3">
              {c.thumbnail_url ? (
                <img src={c.thumbnail_url} className="w-10 h-10 rounded-full" alt="" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                  <Play className="w-4 h-4 text-red-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{c.title}</div>
                {c.handle && (
                  <div className="text-xs text-muted-foreground truncate">{c.handle}</div>
                )}
              </div>
              {c.needs_reauth && (
                <span className="text-[9px] uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-300 px-2 py-0.5 rounded-full">
                  reauth
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {(c.subscriber_count ?? 0).toLocaleString('ru')} подписчиков
            </div>
          </Card>
        </Link>
      ))}
    </div>
  )
}
