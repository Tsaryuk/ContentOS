'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence } from 'framer-motion'
import {
  LayoutGrid, Mail, Globe, Settings,
  Play, Send, Camera
} from 'lucide-react'
import { CHANNELS, Platform } from '@/lib/channels'
import { SidebarFlyout } from './SidebarFlyout'
import { ThemeToggle } from './ThemeToggle'
import { ProjectChannelSwitcher } from './ProjectChannelSwitcher'

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

export const PLATFORM_ICONS: Record<Platform, React.ReactNode> = {
  'youtube': <Play className="w-[18px] h-[18px]" />,
  'youtube-shorts': <Play className="w-[18px] h-[18px]" />,
  'telegram': <Send className="w-[18px] h-[18px]" />,
  'instagram': <Camera className="w-[18px] h-[18px]" />,
  'tiktok': <TikTokIcon />,
  'threads': <ThreadsIcon />,
  'email': <Mail className="w-[18px] h-[18px]" />,
  'website': <Globe className="w-[18px] h-[18px]" />,
}

const NAV_PLATFORMS: { platform: Platform; icon: React.ReactNode; channels: typeof CHANNELS }[] = (() => {
  const groups: { platform: Platform; channels: typeof CHANNELS }[] = []
  const seen = new Set<string>()

  for (const ch of CHANNELS) {
    const key = ch.platform === 'youtube-shorts' ? 'youtube' : ch.platform
    if (!seen.has(key)) {
      seen.add(key)
      groups.push({
        platform: key as Platform,
        channels: CHANNELS.filter(c =>
          key === 'youtube'
            ? c.platform === 'youtube' || c.platform === 'youtube-shorts'
            : c.platform === key
        ),
      })
    }
  }

  return groups.map(g => ({
    ...g,
    icon: PLATFORM_ICONS[g.platform],
  }))
})()

export function Sidebar() {
  const pathname = usePathname()
  const [hoveredPlatform, setHoveredPlatform] = useState<string | null>(null)

  const isDashboard = pathname === '/'

  return (
    <aside className="w-[160px] bg-bg-sidebar border-r border-border flex flex-col items-center py-3 gap-1.5 flex-shrink-0">
      <Link href="/" className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-purple flex items-center justify-center text-white font-bold text-sm mb-1">
        C
      </Link>

      <ProjectChannelSwitcher />

      <div className="w-full px-3"><div className="h-px bg-border" /></div>

      <Link
        href="/"
        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors ${
          isDashboard ? 'bg-accent/10 text-accent' : 'text-muted hover:text-cream'
        }`}
      >
        <LayoutGrid className="w-4 h-4 shrink-0" />
        <span className="text-xs font-medium">Дашборд</span>
      </Link>

      {NAV_PLATFORMS.map(({ platform, icon, channels }) => (
        <div
          key={platform}
          className="relative w-full"
          onMouseEnter={() => setHoveredPlatform(platform)}
          onMouseLeave={() => setHoveredPlatform(null)}
        >
          <div
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              hoveredPlatform === platform ? 'text-cream' : 'text-muted hover:text-cream'
            }`}
          >
            <span className="shrink-0">{icon}</span>
            <span className="text-xs font-medium capitalize">{platform === 'youtube-shorts' ? 'Shorts' : platform.charAt(0).toUpperCase() + platform.slice(1)}</span>
          </div>
          <AnimatePresence>
            {hoveredPlatform === platform && channels.length > 0 && (
              <SidebarFlyout platform={platform} channels={channels} />
            )}
          </AnimatePresence>
        </div>
      ))}

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
    </aside>
  )
}
