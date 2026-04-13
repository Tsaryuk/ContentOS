'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutGrid, Mail, Globe, Settings, Scissors,
  Play, Send, Camera, GalleryHorizontalEnd, CheckSquare
} from 'lucide-react'
import { CHANNELS, Platform } from '@/lib/channels'
import { SidebarFlyout } from './SidebarFlyout'
import { ThemeToggle } from './ThemeToggle'
import { ProjectSwitcher } from './ProjectSwitcher'

const TikTokIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 18" fill="currentColor">
    <path d="M8.3 0h2.7c.2 1.7 1.4 3.1 3 3.4v2.7c-1.1 0-2.1-.3-3-.9v4.3c0 3.3-3.5 5.4-6.3 3.8C2.6 12 2.3 9 4.5 7.5v2.8c-.8.4-1 1.5-.5 2.2.5.8 1.7.9 2.4.3.3-.3.5-.7.5-1.1V0h1.4z"/>
  </svg>
)
const ThreadsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2a8.5 8.5 0 0 1 8.5 8.5c0 3.5-2 6.5-5 8l-3.5 1.5L8.5 22C5.5 20.5 3.5 17.5 3.5 14V10.5A8.5 8.5 0 0 1 12 2z"/>
    <path d="M15 10c0 1.7-1.3 3-3 3s-3-1.3-3-3"/>
  </svg>
)

interface YtChannel {
  id: string
  title: string
  yt_channel_id: string
  thumbnail_url: string | null
  project_id: string | null
}

// Non-YouTube platforms use static config
const OTHER_PLATFORMS: { platform: Platform; label: string; icon: React.ReactNode }[] = [
  { platform: 'instagram', label: 'Instagram', icon: <Camera className="w-4 h-4" /> },
  { platform: 'tiktok',   label: 'TikTok',    icon: <TikTokIcon /> },
  { platform: 'threads',  label: 'Threads',   icon: <ThreadsIcon /> },
  { platform: 'website',  label: 'Сайт',       icon: <Globe className="w-4 h-4" /> },
]

export function Sidebar() {
  const pathname = usePathname()

  // Hide sidebar on public pages (letters.tsaryuk.ru)
  if (pathname.startsWith('/letters')) return null
  const router = useRouter()
  const [hovered, setHovered] = useState<string | null>(null)
  const [ytChannels, setYtChannels] = useState<YtChannel[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [{ projects, channels }, session] = await Promise.all([
        fetch('/api/projects').then(r => r.json()),
        fetch('/api/auth/session').then(r => r.json()),
      ])
      const projId = session.activeProjectId ?? projects?.[0]?.id ?? null
      setActiveProjectId(projId)
      const yt = (channels ?? []).filter((c: YtChannel) =>
        !projId || c.project_id === projId
      )
      setYtChannels(yt)
    }
    load()
  }, [])

  async function switchYtChannel(ytChannelId: string) {
    setHovered(null)
    await fetch('/api/auth/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: ytChannelId }),
    })
    router.push('/youtube')
    router.refresh()
  }

  const isDashboard = pathname === '/'
  const isYoutube = pathname.startsWith('/youtube')
  const isClips = pathname.startsWith('/clips')
  const isCarousels = pathname.startsWith('/carousels')
  const isTasks = pathname.startsWith('/tasks')
  const isTelegram = pathname.startsWith('/telegram')
  const isNewsletter = pathname.startsWith('/newsletter')

  // Static channels for non-YT platforms
  const staticChannelsByPlatform = (platform: Platform) =>
    CHANNELS.filter(c => c.platform === platform)

  return (
    <aside className="w-[160px] bg-bg-sidebar border-r border-border flex flex-col items-center py-3 gap-1.5 flex-shrink-0">
      {/* Logo */}
      <Link href="/" className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-purple flex items-center justify-center text-white font-bold text-sm mb-1">
        C
      </Link>

      {/* Project switcher */}
      <ProjectSwitcher />

      <div className="w-full px-3"><div className="h-px bg-border" /></div>

      {/* Dashboard */}
      <Link
        href="/"
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
          isDashboard ? 'bg-accent/10 text-accent' : 'text-muted hover:text-cream'
        }`}
      >
        <LayoutGrid className="w-4 h-4 shrink-0" />
        <span className="text-xs font-medium">Дашборд</span>
      </Link>

      {/* Tasks */}
      <Link
        href="/tasks"
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
          isTasks ? 'bg-accent/10 text-accent' : 'text-muted hover:text-cream'
        }`}
      >
        <CheckSquare className="w-4 h-4 shrink-0" />
        <span className="text-xs font-medium">Задачи</span>
      </Link>

      {/* YouTube — dynamic channels from DB */}
      <div
        className="relative w-full"
        onMouseEnter={() => setHovered('youtube')}
        onMouseLeave={() => setHovered(null)}
      >
        <div className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
          isYoutube ? 'bg-accent/10 text-accent' : hovered === 'youtube' ? 'text-cream' : 'text-muted hover:text-cream'
        }`}>
          <Play className="w-4 h-4 shrink-0" />
          <span className="text-xs font-medium">YouTube</span>
        </div>
        <AnimatePresence>
          {hovered === 'youtube' && (
            <motion.div
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -4 }}
              transition={{ duration: 0.15 }}
              className="absolute left-full top-0 z-50 w-52 border border-border rounded-xl py-2 bg-white dark:bg-[#161618]"
              style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
            >
              <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-dim mb-1">YouTube</div>
              {ytChannels.length === 0 ? (
                <div className="px-3 py-2 text-xs text-dim">
                  Нет каналов.{' '}
                  <a href="/settings" className="text-accent underline">Настройки</a>
                </div>
              ) : (
                ytChannels.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => switchYtChannel(ch.yt_channel_id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.04] transition-colors text-left"
                  >
                    {ch.thumbnail_url
                      ? <img src={ch.thumbnail_url} className="w-5 h-5 rounded-full shrink-0" alt="" />
                      : <div className="w-5 h-5 rounded-full bg-red-500/20 shrink-0" />
                    }
                    <span className="text-xs text-muted hover:text-cream truncate">{ch.title}</span>
                  </button>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Clips */}
      <Link
        href="/clips"
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
          isClips ? 'bg-accent/10 text-accent' : 'text-muted hover:text-cream'
        }`}
      >
        <Scissors className="w-4 h-4 shrink-0" />
        <span className="text-xs font-medium">Клипы</span>
      </Link>

      {/* Carousels */}
      <Link
        href="/carousels"
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
          isCarousels ? 'bg-accent/10 text-accent' : 'text-muted hover:text-cream'
        }`}
      >
        <GalleryHorizontalEnd className="w-4 h-4 shrink-0" />
        <span className="text-xs font-medium">Карусели</span>
      </Link>

      {/* Telegram */}
      <Link
        href="/telegram"
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
          isTelegram ? 'bg-accent/10 text-accent' : 'text-muted hover:text-cream'
        }`}
      >
        <Send className="w-4 h-4 shrink-0" />
        <span className="text-xs font-medium">Telegram</span>
      </Link>

      {/* Newsletter */}
      <Link
        href="/newsletter"
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
          isNewsletter ? 'bg-accent/10 text-accent' : 'text-muted hover:text-cream'
        }`}
      >
        <Mail className="w-4 h-4 shrink-0" />
        <span className="text-xs font-medium">Рассылка</span>
      </Link>

      {/* Other platforms */}
      {OTHER_PLATFORMS.map(({ platform, label, icon }) => {
        const staticChs = staticChannelsByPlatform(platform)
        return (
          <div
            key={platform}
            className="relative w-full"
            onMouseEnter={() => setHovered(platform)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              hovered === platform ? 'text-cream' : 'text-muted hover:text-cream'
            }`}>
              <span className="shrink-0">{icon}</span>
              <span className="text-xs font-medium">{label}</span>
            </div>
            <AnimatePresence>
              {hovered === platform && staticChs.length > 0 && (
                <SidebarFlyout platform={platform} channels={staticChs} />
              )}
            </AnimatePresence>
          </div>
        )
      })}

      <div className="flex-1" />

      <div className="w-full px-1.5 flex items-center justify-between">
        <ThemeToggle />
        <Link
          href="/settings"
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            pathname === '/settings' ? 'bg-accent/10 text-accent' : 'text-dim hover:text-muted'
          }`}
          title="Настройки"
        >
          <Settings className="w-4 h-4" />
        </Link>
      </div>
      <div className="w-full px-2 pb-1 text-[9px] text-dim/40 text-center font-mono">
        {process.env.NEXT_PUBLIC_BUILD_SHA ?? 'dev'}
      </div>
    </aside>
  )
}
