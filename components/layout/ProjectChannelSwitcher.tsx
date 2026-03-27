'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Check, Play } from 'lucide-react'

interface Project { id: string; name: string; color: string }
interface Channel {
  id: string; title: string; handle: string | null
  thumbnail_url: string | null; project_id: string | null
  yt_channel_id: string
}

export function ProjectChannelSwitcher() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then(r => r.json()),
      fetch('/api/auth/session').then(r => r.json()),
    ]).then(([{ projects: p, channels: c }, session]) => {
      setProjects(p ?? [])
      setChannels(c ?? [])
      // Default to first channel if none active
      const active = session.activeChannelId ?? c?.[0]?.yt_channel_id ?? null
      setActiveChannelId(active)
    })
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  async function switchChannel(ytChannelId: string) {
    setActiveChannelId(ytChannelId)
    setOpen(false)
    await fetch('/api/auth/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: ytChannelId }),
    })
    router.refresh()
  }

  const active = channels.find(c => c.yt_channel_id === activeChannelId)

  if (channels.length === 0) return null

  // Group channels by project
  const grouped: { project: Project | null; channels: Channel[] }[] = []
  const unassigned = channels.filter(c => !c.project_id)
  for (const proj of projects) {
    const projChannels = channels.filter(c => c.project_id === proj.id)
    if (projChannels.length > 0) grouped.push({ project: proj, channels: projChannels })
  }
  if (unassigned.length > 0) grouped.push({ project: null, channels: unassigned })

  return (
    <div ref={ref} className="relative w-full px-1.5">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface transition-colors group"
        title={active?.title ?? 'Выбрать канал'}
      >
        {active?.thumbnail_url
          ? <img src={active.thumbnail_url} className="w-6 h-6 rounded-full shrink-0" alt="" />
          : <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
              <Play className="w-3 h-3 text-red-400" />
            </div>
        }
        <span className="text-[11px] text-cream truncate flex-1 text-left leading-tight">
          {active?.title ?? 'Канал'}
        </span>
        <ChevronDown className={`w-3 h-3 text-dim shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-1.5 right-1.5 top-full mt-1 bg-bg border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {grouped.map(({ project, channels: pChannels }) => (
            <div key={project?.id ?? 'unassigned'}>
              {project && (
                <div className="px-3 pt-2.5 pb-1 flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: project.color }} />
                  <span className="text-[10px] text-dim font-medium uppercase tracking-wider truncate">
                    {project.name}
                  </span>
                </div>
              )}
              {pChannels.map(ch => (
                <button
                  key={ch.id}
                  onClick={() => switchChannel(ch.yt_channel_id)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface transition-colors text-left"
                >
                  {ch.thumbnail_url
                    ? <img src={ch.thumbnail_url} className="w-6 h-6 rounded-full shrink-0" alt="" />
                    : <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                        <Play className="w-3 h-3 text-red-400" />
                      </div>
                  }
                  <span className="text-xs text-cream flex-1 truncate">{ch.title}</span>
                  {ch.yt_channel_id === activeChannelId && (
                    <Check className="w-3.5 h-3.5 text-accent shrink-0" />
                  )}
                </button>
              ))}
            </div>
          ))}
          <div className="border-t border-border">
            <a
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2.5 hover:bg-surface transition-colors text-xs text-muted"
            >
              Управление каналами
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
