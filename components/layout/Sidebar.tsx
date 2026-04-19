'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutGrid, Mail, Globe, Settings, Scissors, FileText,
  Play, Send, Camera, GalleryHorizontalEnd, CheckSquare, Calendar,
  LogOut, Shield, ChevronDown,
} from 'lucide-react'
import { CHANNELS, Platform } from '@/lib/channels'
import { SidebarFlyout } from './SidebarFlyout'
import { ThemeToggle } from './ThemeToggle'
import { ProjectSwitcher } from './ProjectSwitcher'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuPage,
} from '@/components/ui/dropdown-menu'

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

interface SessionUser {
  userId: string | null
  userName: string | null
  userRole: 'admin' | 'manager' | null
}

const OTHER_PLATFORMS: { platform: Platform; label: string; icon: React.ReactNode }[] = [
  { platform: 'instagram', label: 'Instagram', icon: <Camera className="w-4 h-4" /> },
  { platform: 'tiktok',   label: 'TikTok',    icon: <TikTokIcon /> },
  { platform: 'threads',  label: 'Threads',   icon: <ThreadsIcon /> },
  { platform: 'website',  label: 'Сайт',       icon: <Globe className="w-4 h-4" /> },
]

function NavItem({
  href,
  icon,
  label,
  active,
}: {
  href: string
  icon: React.ReactNode
  label: string
  active: boolean
}) {
  return (
    <Link
      href={href}
      data-active={active || undefined}
      className="group relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors
        text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent
        data-[active]:bg-sidebar-accent data-[active]:text-sidebar-foreground"
    >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-accent" />
      )}
      <span className={`shrink-0 ${active ? 'text-accent' : 'text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80'}`}>
        {icon}
      </span>
      <span>{label}</span>
    </Link>
  )
}

export function Sidebar() {
  const pathname = usePathname()

  // Hide sidebar on public pages (letters.tsaryuk.ru)
  if (pathname.startsWith('/letters')) return null
  const router = useRouter()
  const [hovered, setHovered] = useState<string | null>(null)
  const [ytChannels, setYtChannels] = useState<YtChannel[]>([])
  const [session, setSession] = useState<SessionUser>({ userId: null, userName: null, userRole: null })

  useEffect(() => {
    async function load() {
      const [{ projects, channels }, sessionRes] = await Promise.all([
        fetch('/api/projects').then(r => r.json()),
        fetch('/api/auth/session').then(r => r.json()),
      ])
      const projId = sessionRes.activeProjectId ?? projects?.[0]?.id ?? null
      const yt = (channels ?? []).filter((c: YtChannel) =>
        !projId || c.project_id === projId,
      )
      setYtChannels(yt)
      setSession({
        userId: sessionRes.userId ?? null,
        userName: sessionRes.userName ?? null,
        userRole: sessionRes.userRole ?? null,
      })
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

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  const isDashboard = pathname === '/'
  const isYoutube = pathname.startsWith('/youtube')
  const isClips = pathname.startsWith('/clips')
  const isCarousels = pathname.startsWith('/carousels')
  const isTasks = pathname.startsWith('/tasks')
  const isCalendar = pathname.startsWith('/calendar')
  const isTelegram = pathname.startsWith('/telegram')
  const isNewsletter = pathname.startsWith('/newsletter')
  const isArticles = pathname.startsWith('/articles')

  const staticChannelsByPlatform = (platform: Platform) =>
    CHANNELS.filter(c => c.platform === platform)

  const userInitial = (session.userName ?? '?').trim().charAt(0).toUpperCase()
  const firstName = (session.userName ?? '').split(/\s+/)[0] ?? ''

  return (
    <aside className="w-[180px] bg-sidebar border-r border-sidebar-border flex flex-col py-3 gap-0.5 flex-shrink-0 text-sidebar-foreground">
      {/* Brand + project */}
      <div className="px-3 flex items-center gap-2 mb-2">
        <Link
          href="/"
          aria-label="ContentOS"
          className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-purple flex items-center justify-center text-white font-bold text-sm shadow-md shadow-accent/30 shrink-0"
        >
          C
        </Link>
        <div className="text-[11px] font-semibold tracking-tight text-sidebar-foreground">ContentOS</div>
      </div>

      <div className="px-2">
        <ProjectSwitcher />
      </div>

      <div className="px-3 my-2"><div className="h-px bg-sidebar-border" /></div>

      {/* Main nav */}
      <nav className="flex flex-col gap-0.5 px-2">
        <NavItem href="/" icon={<LayoutGrid className="w-4 h-4" />} label="Дашборд" active={isDashboard} />
        <NavItem href="/tasks" icon={<CheckSquare className="w-4 h-4" />} label="Задачи" active={isTasks} />
        <NavItem href="/calendar" icon={<Calendar className="w-4 h-4" />} label="Календарь" active={isCalendar} />
      </nav>

      <div className="px-3 my-2">
        <div className="text-[9px] uppercase tracking-[0.12em] font-semibold text-sidebar-foreground/40 px-1">Каналы</div>
      </div>

      <nav className="flex flex-col gap-0.5 px-2">
        {/* YouTube (dynamic channels) */}
        <div
          className="relative w-full"
          onMouseEnter={() => setHovered('youtube')}
          onMouseLeave={() => setHovered(null)}
        >
          <div
            data-active={isYoutube || undefined}
            className="group relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer
              text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent
              data-[active]:bg-sidebar-accent data-[active]:text-sidebar-foreground"
          >
            {isYoutube && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-accent" />}
            <Play className={`w-4 h-4 shrink-0 ${isYoutube ? 'text-accent' : 'text-sidebar-foreground/50'}`} />
            <span>YouTube</span>
          </div>
          <AnimatePresence>
            {hovered === 'youtube' && (
              <motion.div
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute left-full top-0 z-50 w-56 border border-border rounded-xl py-2 bg-popover shadow-pop"
              >
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">YouTube</div>
                {ytChannels.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    Нет каналов.{' '}
                    <a href="/settings" className="text-accent underline">Настройки</a>
                  </div>
                ) : (
                  ytChannels.map(ch => (
                    <button
                      key={ch.id}
                      onClick={() => switchYtChannel(ch.yt_channel_id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-accent-surface transition-colors text-left"
                    >
                      {ch.thumbnail_url
                        ? <img src={ch.thumbnail_url} className="w-5 h-5 rounded-full shrink-0" alt="" />
                        : <div className="w-5 h-5 rounded-full bg-red-500/20 shrink-0" />
                      }
                      <span className="text-xs text-foreground truncate">{ch.title}</span>
                    </button>
                  ))
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <NavItem href="/clips" icon={<Scissors className="w-4 h-4" />} label="Клипы" active={isClips} />
        <NavItem href="/carousels" icon={<GalleryHorizontalEnd className="w-4 h-4" />} label="Карусели" active={isCarousels} />
        <NavItem href="/telegram" icon={<Send className="w-4 h-4" />} label="Telegram" active={isTelegram} />
        <NavItem href="/articles" icon={<FileText className="w-4 h-4" />} label="Статьи" active={isArticles} />
        <NavItem href="/newsletter" icon={<Mail className="w-4 h-4" />} label="Рассылка" active={isNewsletter} />

        {/* Other platforms (hover flyout) */}
        {OTHER_PLATFORMS.map(({ platform, label, icon }) => {
          const staticChs = staticChannelsByPlatform(platform)
          return (
            <div
              key={platform}
              className="relative w-full"
              onMouseEnter={() => setHovered(platform)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="group relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent">
                <span className="shrink-0 text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80">{icon}</span>
                <span>{label}</span>
              </div>
              <AnimatePresence>
                {hovered === platform && staticChs.length > 0 && (
                  <SidebarFlyout platform={platform} channels={staticChs} />
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </nav>

      <div className="flex-1" />

      {/* Bottom: theme + settings + account */}
      <div className="px-2 pt-2">
        <div className="flex items-center justify-between gap-1 mb-1 px-1">
          <ThemeToggle />
          <Link
            href="/settings"
            data-active={pathname === '/settings' || undefined}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors
              text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent
              data-[active]:text-accent data-[active]:bg-sidebar-accent"
            title="Настройки"
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>

        {session.userId && (
          <DropdownMenu>
            <DropdownMenuTrigger className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-accent transition-colors">
              <div className="w-7 h-7 rounded-full bg-accent/20 border border-accent/30 text-accent flex items-center justify-center text-[11px] font-semibold shrink-0">
                {userInitial}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="text-[11px] font-semibold text-sidebar-foreground truncate">{firstName || 'Аккаунт'}</div>
                {session.userRole === 'admin' && (
                  <div className="text-[9px] uppercase tracking-wider text-accent/70 flex items-center gap-1">
                    <Shield className="w-2.5 h-2.5" /> admin
                  </div>
                )}
              </div>
              <ChevronDown className="w-3 h-3 text-sidebar-foreground/50 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 rounded-xl" align="end" side="top" sideOffset={6}>
              <DropdownMenuPage id="main">
                <DropdownMenuLabel>{session.userName ?? 'Пользователь'}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    <span>Настройки</span>
                  </Link>
                </DropdownMenuItem>
                {session.userRole === 'admin' && (
                  <DropdownMenuItem asChild>
                    <Link href="/admin">
                      <Shield className="w-4 h-4 text-muted-foreground" />
                      <span>Админка</span>
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10"
                  onSelect={(e) => { e.preventDefault(); void signOut() }}
                >
                  <LogOut className="w-4 h-4" />
                  <span>Выйти</span>
                </DropdownMenuItem>
              </DropdownMenuPage>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="pt-1.5 pb-0.5 text-[9px] text-sidebar-foreground/30 text-center font-mono">
          {process.env.NEXT_PUBLIC_BUILD_SHA ?? 'dev'}
        </div>
      </div>
    </aside>
  )
}
