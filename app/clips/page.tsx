'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Scissors, Loader2, Zap } from 'lucide-react'
import { Card } from '@/components/ui/card'

interface VideoWithClips {
  id: string
  current_title: string
  current_thumbnail: string
  duration_seconds: number
  clip_count: number
}

export default function ClipsIndexPage() {
  const router = useRouter()
  const [videos, setVideos] = useState<VideoWithClips[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const res = await fetch('/api/clips/list')
      const { videos: vs, counts } = await res.json().catch(() => ({ videos: [], counts: {} }))
      setVideos((vs ?? []).map((v: any) => ({ ...v, clip_count: counts?.[v.id] ?? 0 })))
      setLoading(false)
    }
    load()
  }, [])

  const withClips = videos.filter(v => v.clip_count > 0).length

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2 uppercase tracking-wider">
          <span>ContentOS</span>
          <span className="w-1 h-1 rounded-full bg-border" />
          <span className="normal-case tracking-normal">Короткие видео</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight">Клипы</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {loading
            ? 'Загружаем…'
            : videos.length === 0
              ? 'Нет видео с транскриптом'
              : `${videos.length} ${videos.length === 1 ? 'видео' : videos.length < 5 ? 'видео' : 'видео'} · ${withClips} с клипами`}
        </p>
      </header>

      {loading ? (
        <div className="py-24 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : videos.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center">
          <Scissors className="w-10 h-10 text-muted-foreground mb-3" />
          <p className="text-foreground font-medium mb-1">Нет видео с транскриптом</p>
          <p className="text-sm text-muted-foreground">Сначала транскрибируйте видео, чтобы нарезать клипы</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {videos.map(v => (
            <Card
              key={v.id}
              onClick={() => router.push(`/clips/${v.id}`)}
              className="flex items-center gap-4 p-4 hover:shadow-card-hover transition-shadow cursor-pointer"
            >
              <img src={v.current_thumbnail} alt="" className="w-24 h-16 rounded-lg object-cover shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{v.current_title}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {Math.round(v.duration_seconds / 60)} мин
                </p>
              </div>
              <div className="shrink-0">
                {v.clip_count > 0 ? (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent">
                    {v.clip_count} {v.clip_count === 1 ? 'клип' : v.clip_count < 5 ? 'клипа' : 'клипов'}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Zap className="w-3 h-3" /> Анализировать
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
