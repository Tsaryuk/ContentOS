'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Scissors, Loader2, Zap } from 'lucide-react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

interface VideoWithClips {
  id: string
  current_title: string
  current_thumbnail: string
  duration_seconds: number
  clip_count: number
}

export default function ClipsIndexPage() {
  const [videos, setVideos] = useState<VideoWithClips[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Get videos that have transcripts (eligible for clips)
      const res = await fetch(`${SUPABASE_URL}/rest/v1/yt_videos?transcript=not.is.null&select=id,current_title,current_thumbnail,duration_seconds&order=published_at.desc&limit=50`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      })
      const data = await res.json()

      // Get clip counts per video
      const clipRes = await fetch(`${SUPABASE_URL}/rest/v1/clip_candidates?select=video_id`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      })
      const clips = await clipRes.json()
      const countMap: Record<string, number> = {}
      for (const c of clips ?? []) {
        countMap[c.video_id] = (countMap[c.video_id] ?? 0) + 1
      }

      setVideos((data ?? []).map((v: any) => ({ ...v, clip_count: countMap[v.id] ?? 0 })))
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-5 h-5 animate-spin text-muted" />
    </div>
  )

  return (
    <div className="px-6 py-5 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Scissors className="w-5 h-5 text-purple" />
        <h1 className="text-lg font-semibold text-cream">Клипы</h1>
      </div>

      {videos.length === 0 ? (
        <div className="text-center py-16 text-muted text-sm">
          Нет видео с транскриптом. Сначала транскрибируйте видео.
        </div>
      ) : (
        <div className="space-y-2">
          {videos.map(v => (
            <Link key={v.id} href={`/clips/${v.id}`}>
              <div className="flex items-center gap-4 p-3 bg-surface border border-border rounded-xl hover:border-muted/30 transition-colors cursor-pointer">
                <img src={v.current_thumbnail} alt="" className="w-24 h-14 rounded-lg object-cover shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{v.current_title}</p>
                  <p className="text-[10px] text-dim mt-0.5">
                    {Math.round(v.duration_seconds / 60)} мин
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  {v.clip_count > 0 ? (
                    <span className="text-xs text-purple">{v.clip_count} клипов</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-dim">
                      <Zap className="w-3 h-3" /> Анализировать
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
