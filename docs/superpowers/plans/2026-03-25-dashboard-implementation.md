# ContentOS Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the main dashboard page (`/`) with hybrid sidebar, hero metrics, channel grid, filter tabs, AI insights bar, and dark/light theme toggle.

**Architecture:** Global sidebar layout wraps all pages. Dashboard aggregates YouTube data from Supabase + placeholder data for unconnected platforms. Theme system uses CSS variables with Tailwind `darkMode: 'class'`.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, Framer Motion, Supabase, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-03-25-dashboard-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `tailwind.config.ts` | Modify | Add `darkMode`, `content` path, CSS var colors |
| `app/globals.css` | Modify | CSS variables for dark/light themes |
| `lib/theme.ts` | Create | `useTheme()` hook, localStorage persistence |
| `lib/channels.ts` | Create | `Channel` / `Platform` types, channel config, aggregation helpers |
| `components/layout/Sidebar.tsx` | Create | Hybrid sidebar with icon nav |
| `components/layout/SidebarFlyout.tsx` | Create | Hover flyout panel for platform channels |
| `components/layout/ThemeToggle.tsx` | Create | Sun/moon toggle button |
| `components/dashboard/HeroMetrics.tsx` | Create | 4 metric cards row |
| `components/dashboard/FilterTabs.tsx` | Create | Platform filter pills with Framer Motion |
| `components/dashboard/ChannelCard.tsx` | Create | Connected + placeholder channel card |
| `components/dashboard/ChannelGrid.tsx` | Create | Filtered grid of ChannelCards |
| `components/dashboard/AiInsightsBar.tsx` | Create | Compact AI insights strip |
| `app/layout.tsx` | Modify | Wrap children in sidebar layout |
| `app/page.tsx` | Replace | Dashboard page |
| `app/youtube/page.tsx` | Modify | Remove `min-h-screen bg-[#09090b]` from root div |

---

### Task 1: Theme Infrastructure

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`
- Create: `lib/theme.ts`

- [ ] **Step 1: Update `tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--bg-surface)',
        'bg-sidebar': 'var(--bg-sidebar)',
        border: 'var(--border)',
        cream: 'var(--text-primary)',
        muted: 'var(--text-secondary)',
        dim: 'var(--text-tertiary)',
        accent: 'var(--accent)',
        purple: 'var(--purple)',
        green: 'var(--green)',
        warn: 'var(--warn)',
        gold: '#c4a96a',
        danger: '#e05a5a',
      },
      boxShadow: {
        'surface': 'var(--shadow)',
      },
    },
  },
  plugins: [],
}
export default config
```

- [ ] **Step 2: Update `app/globals.css` with CSS variables**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #fafaf9;
  --bg-surface: #ffffff;
  --bg-sidebar: #f0f0ee;
  --border: rgba(0,0,0,0.08);
  --text-primary: #1a1a1a;
  --text-secondary: rgba(0,0,0,0.4);
  --text-tertiary: rgba(0,0,0,0.25);
  --accent: #4a7fd4;
  --purple: #8b5cf6;
  --green: #16a34a;
  --warn: #f59e0b;
  --shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.dark {
  --bg: #09090b;
  --bg-surface: rgba(255,255,255,0.03);
  --bg-sidebar: #0e0e10;
  --border: rgba(255,255,255,0.06);
  --text-primary: #f0ede8;
  --text-secondary: rgba(255,255,255,0.4);
  --text-tertiary: rgba(255,255,255,0.2);
  --accent: #6b9ff0;
  --purple: #a67ff0;
  --green: #4ade80;
  --warn: #f0b84a;
  --shadow: none;
}

body {
  background: var(--bg);
  color: var(--text-primary);
}

* {
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}
```

- [ ] **Step 3: Create `lib/theme.ts`**

```typescript
'use client'

import { useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const stored = localStorage.getItem('theme') as Theme | null
  if (stored) return stored
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setTheme(getInitialTheme())
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    const root = document.documentElement
    root.classList.remove('dark', 'light')
    root.classList.add(theme)
    localStorage.setItem('theme', theme)
  }, [theme, mounted])

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark')

  return { theme, toggleTheme, mounted }
}
```

- [ ] **Step 4: Verify the build passes**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds. Existing `/youtube` page still works because its hardcoded dark values match the dark CSS variables.

- [ ] **Step 5: Commit**

```bash
git add tailwind.config.ts app/globals.css lib/theme.ts
git commit -m "feat: add dark/light theme infrastructure with CSS variables"
```

---

### Task 2: Channel Data Layer

**Files:**
- Create: `lib/channels.ts`

- [ ] **Step 1: Create `lib/channels.ts` with types and config**

```typescript
export type Platform = 'youtube' | 'youtube-shorts' | 'telegram' | 'instagram' | 'tiktok' | 'threads' | 'email' | 'website'

export type ChannelMetrics = {
  subscribers: number
  views: number
  contentCount: number
  growthPercent: number
  engagement?: number
}

export type Channel = {
  id: string
  name: string
  platform: Platform
  slug: string
  icon?: string              // optional SVG or emoji override
  connected: boolean
  metrics: ChannelMetrics | null
  href: string
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  'youtube': 'YouTube',
  'youtube-shorts': 'Shorts',
  'telegram': 'Telegram',
  'instagram': 'Instagram',
  'tiktok': 'TikTok',
  'threads': 'Threads',
  'email': 'Email',
  'website': 'Сайт',
}

export const CHANNELS: Channel[] = [
  {
    id: 'yt-lichnaya-filosofiya',
    name: 'Личная Философия',
    platform: 'youtube',
    slug: 'lichnaya-filosofiya',
    connected: true,
    metrics: null, // populated from Supabase
    href: '/youtube',
  },
  {
    id: 'yt-dolg-i-dengi',
    name: 'Долг и Деньги',
    platform: 'youtube',
    slug: 'dolg-i-dengi',
    connected: true,
    metrics: null,
    href: '/youtube',
  },
  {
    id: 'yt-zhizn-kak-iskusstvo',
    name: 'Жизнь как искусство',
    platform: 'youtube',
    slug: 'zhizn-kak-iskusstvo',
    connected: true,
    metrics: null,
    href: '/youtube',
  },
  {
    id: 'yt-shorts',
    name: 'Денис Царюк Shorts',
    platform: 'youtube-shorts',
    slug: 'shorts',
    connected: true,
    metrics: null,
    href: '/youtube',
  },
  {
    id: 'tg-denis',
    name: 'Денис Царюк',
    platform: 'telegram',
    slug: 'telegram',
    connected: false,
    metrics: null,
    href: '#',
  },
  {
    id: 'ig-personal',
    name: 'Instagram личный',
    platform: 'instagram',
    slug: 'instagram-personal',
    connected: false,
    metrics: null,
    href: '#',
  },
  {
    id: 'ig-filosofiya',
    name: 'Личная Философия',
    platform: 'instagram',
    slug: 'instagram-filosofiya',
    connected: false,
    metrics: null,
    href: '#',
  },
  {
    id: 'tt-denis',
    name: 'Денис Царюк',
    platform: 'tiktok',
    slug: 'tiktok',
    connected: false,
    metrics: null,
    href: '#',
  },
  {
    id: 'threads-denis',
    name: 'Денис Царюк',
    platform: 'threads',
    slug: 'threads',
    connected: false,
    metrics: null,
    href: '#',
  },
  {
    id: 'email-unisender',
    name: 'Email рассылка',
    platform: 'email',
    slug: 'email',
    connected: false,
    metrics: null,
    href: '#',
  },
  {
    id: 'web-tsaryuk',
    name: 'tsaryuk.ru',
    platform: 'website',
    slug: 'website',
    connected: false,
    metrics: null,
    href: '#',
  },
]

export function getUniquePlatforms(channels: Channel[]): Platform[] {
  const seen = new Set<Platform>()
  const result: Platform[] = []
  for (const ch of channels) {
    if (!seen.has(ch.platform)) {
      seen.add(ch.platform)
      result.push(ch.platform)
    }
  }
  return result
}

export function aggregateMetrics(channels: Channel[]): {
  subscribers: number
  views: number
  contentCount: number
  engagement: number | null
} {
  const connected = channels.filter(c => c.connected && c.metrics)
  const subscribers = connected.reduce((sum, c) => sum + (c.metrics?.subscribers ?? 0), 0)
  const views = connected.reduce((sum, c) => sum + (c.metrics?.views ?? 0), 0)
  const contentCount = connected.reduce((sum, c) => sum + (c.metrics?.contentCount ?? 0), 0)

  let engagement: number | null = null
  const withEngagement = connected.filter(c => c.metrics?.engagement != null && (c.metrics?.views ?? 0) > 0)
  if (withEngagement.length > 0) {
    const totalViews = withEngagement.reduce((sum, c) => sum + (c.metrics?.views ?? 0), 0)
    if (totalViews > 0) {
      engagement = withEngagement.reduce(
        (sum, c) => sum + (c.metrics!.engagement! * (c.metrics!.views / totalViews)),
        0
      )
    }
  }

  return { subscribers, views, contentCount, engagement }
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add lib/channels.ts
git commit -m "feat: add channel types, config, and aggregation helpers"
```

---

### Task 3: ThemeToggle Component

**Files:**
- Create: `components/layout/ThemeToggle.tsx`

- [ ] **Step 1: Create `components/layout/ThemeToggle.tsx`**

```typescript
'use client'

import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/lib/theme'

export function ThemeToggle() {
  const { theme, toggleTheme, mounted } = useTheme()

  if (!mounted) return <div className="w-9 h-9" />

  return (
    <button
      onClick={toggleTheme}
      className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:text-cream transition-colors"
      title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
    >
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/layout/ThemeToggle.tsx
git commit -m "feat: add ThemeToggle component"
```

---

### Task 4: Sidebar + Flyout

**Files:**
- Create: `components/layout/SidebarFlyout.tsx`
- Create: `components/layout/Sidebar.tsx`

- [ ] **Step 1: Create `components/layout/SidebarFlyout.tsx`**

```typescript
'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Channel, PLATFORM_LABELS, Platform } from '@/lib/channels'

type Props = {
  platform: Platform
  channels: Channel[]
}

export function SidebarFlyout({ platform, channels }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -4 }}
      transition={{ duration: 0.15 }}
      className="absolute left-[52px] top-0 z-50 w-48 border border-border rounded-lg py-2 bg-[#161618] dark:bg-[#161618] bg-white"
      style={{ boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
    >
      <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-dim">
        {PLATFORM_LABELS[platform]}
      </div>
      {channels.map(ch => (
        <Link
          key={ch.id}
          href={ch.href}
          className="flex items-center gap-2 px-3 py-2 text-xs text-muted hover:text-cream hover:bg-white/[0.04] transition-colors"
        >
          <span className="truncate">{ch.name}</span>
          {!ch.connected && (
            <span className="text-[9px] text-dim ml-auto">скоро</span>
          )}
        </Link>
      ))}
    </motion.div>
  )
}
```

- [ ] **Step 2: Create `components/layout/Sidebar.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { AnimatePresence } from 'framer-motion'
import {
  LayoutGrid, Mail, Globe, Settings,
  Youtube, Send, Instagram, Hash
} from 'lucide-react'
import { CHANNELS, Platform } from '@/lib/channels'
import { SidebarFlyout } from './SidebarFlyout'
import { ThemeToggle } from './ThemeToggle'

// TikTok and Threads don't have lucide icons — use inline SVGs
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
  'youtube': <Youtube className="w-[18px] h-[18px]" />,
  'youtube-shorts': <Youtube className="w-[18px] h-[18px]" />,
  'telegram': <Send className="w-[18px] h-[18px]" />,
  'instagram': <Instagram className="w-[18px] h-[18px]" />,
  'tiktok': <TikTokIcon />,
  'threads': <ThreadsIcon />,
  'email': <Mail className="w-[18px] h-[18px]" />,
  'website': <Globe className="w-[18px] h-[18px]" />,
}

// Group channels by platform, merge youtube + youtube-shorts under youtube icon
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
    <aside className="w-[52px] bg-bg-sidebar border-r border-border flex flex-col items-center py-3 gap-1.5 flex-shrink-0">
      {/* Logo */}
      <Link href="/" className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-purple flex items-center justify-center text-white font-bold text-sm mb-2">
        C
      </Link>

      {/* Divider */}
      <div className="w-6 h-px bg-border mb-1" />

      {/* Dashboard */}
      <Link
        href="/"
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
          isDashboard ? 'bg-accent/10 text-accent' : 'text-muted hover:text-cream'
        }`}
        title="Дашборд"
      >
        <LayoutGrid className="w-[18px] h-[18px]" />
      </Link>

      {/* Platform nav */}
      {NAV_PLATFORMS.map(({ platform, icon, channels }) => (
        <div
          key={platform}
          className="relative"
          onMouseEnter={() => setHoveredPlatform(platform)}
          onMouseLeave={() => setHoveredPlatform(null)}
        >
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              hoveredPlatform === platform ? 'text-cream' : 'text-muted hover:text-cream'
            }`}
            title={platform}
          >
            {icon}
          </div>
          <AnimatePresence>
            {hoveredPlatform === platform && channels.length > 0 && (
              <SidebarFlyout platform={platform} channels={channels} />
            )}
          </AnimatePresence>
        </div>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Theme toggle */}
      <ThemeToggle />

      {/* Settings */}
      <button
        className="w-9 h-9 rounded-lg flex items-center justify-center text-dim hover:text-muted transition-colors"
        title="Настройки"
      >
        <Settings className="w-4 h-4" />
      </button>
    </aside>
  )
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add components/layout/Sidebar.tsx components/layout/SidebarFlyout.tsx
git commit -m "feat: add hybrid Sidebar with flyout navigation"
```

---

### Task 5: Dashboard Components

**Files:**
- Create: `components/dashboard/HeroMetrics.tsx`
- Create: `components/dashboard/FilterTabs.tsx`
- Create: `components/dashboard/ChannelCard.tsx`
- Create: `components/dashboard/ChannelGrid.tsx`
- Create: `components/dashboard/AiInsightsBar.tsx`

- [ ] **Step 1: Create `components/dashboard/HeroMetrics.tsx`**

```typescript
'use client'

type Metric = {
  label: string
  value: string
  color: string
  growth?: { value: string; positive: boolean }
}

export function HeroMetrics({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {metrics.map(m => (
        <div
          key={m.label}
          className="bg-surface border border-border rounded-xl p-4 shadow-surface"
        >
          <div className="text-[10px] uppercase tracking-wide text-muted mb-2">
            {m.label}
          </div>
          <div className="text-2xl font-semibold" style={{ color: m.color }}>
            {m.value}
          </div>
          {m.growth && (
            <div className="flex items-center gap-1 mt-1.5">
              <span className={`text-[10px] ${m.growth.positive ? 'text-green' : 'text-warn'}`}>
                {m.growth.value}
              </span>
              <span className="text-[9px] text-dim">за месяц</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `components/dashboard/FilterTabs.tsx`**

```typescript
'use client'

import { motion } from 'framer-motion'
import { Platform, PLATFORM_LABELS } from '@/lib/channels'

type TabItem = {
  id: string
  label: string
  count: number
}

type Props = {
  tabs: TabItem[]
  activeTab: string
  onTabChange: (id: string) => void
}

export function FilterTabs({ tabs, activeTab, onTabChange }: Props) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className="relative px-3.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors"
        >
          {activeTab === tab.id && (
            <motion.div
              layoutId="dashboardTab"
              className="absolute inset-0 bg-accent/10 border border-accent/25 rounded-lg"
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          )}
          <span className={`relative z-10 ${activeTab === tab.id ? 'text-accent' : 'text-muted hover:text-cream'}`}>
            {tab.label}
            <span className="ml-1.5 text-dim">{tab.count}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create `components/dashboard/ChannelCard.tsx`**

```typescript
'use client'

import Link from 'next/link'
import { Channel } from '@/lib/channels'
import { PLATFORM_ICONS } from '@/components/layout/Sidebar'

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

export function ChannelCard({ channel }: { channel: Channel }) {
  if (!channel.connected || !channel.metrics) {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 opacity-60 cursor-pointer hover:border-muted/20 transition-colors">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-4 h-4 text-muted">{PLATFORM_ICONS[channel.platform]}</span>
          <span className="text-xs font-medium text-cream">{channel.name}</span>
          <span className="ml-auto text-[9px] bg-surface border border-border text-dim px-1.5 py-0.5 rounded">
            скоро
          </span>
        </div>
        <div className="text-sm text-dim text-center py-2">API не подключён</div>
        <div className="text-[9px] text-dim text-center mt-1.5">Нажмите для настройки</div>
      </div>
    )
  }

  return (
    <Link href={channel.href}>
      <div className="bg-surface border border-border rounded-xl p-4 cursor-pointer hover:border-muted/30 transition-colors">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-4 h-4 text-muted">{PLATFORM_ICONS[channel.platform]}</span>
          <span className="text-xs font-medium text-cream">{channel.name}</span>
          {channel.metrics.growthPercent !== 0 && (
            <span className={`ml-auto text-[9px] px-1.5 py-0.5 rounded ${
              channel.metrics.growthPercent > 0
                ? 'bg-green/10 text-green'
                : 'bg-warn/10 text-warn'
            }`}>
              {channel.metrics.growthPercent > 0 ? '+' : ''}{channel.metrics.growthPercent}%
            </span>
          )}
        </div>
        <div className="flex gap-4">
          <div>
            <div className="text-lg font-semibold text-accent">
              {fmtNumber(channel.metrics.subscribers)}
            </div>
            <div className="text-[9px] text-dim">подписчики</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-cream/70">
              {fmtNumber(channel.metrics.views)}
            </div>
            <div className="text-[9px] text-dim">просмотры</div>
          </div>
        </div>
        <div className="mt-2.5 text-[9px] text-dim">
          {channel.metrics.contentCount} публикаций &bull; Подключено
        </div>
      </div>
    </Link>
  )
}
```

- [ ] **Step 4: Create `components/dashboard/ChannelGrid.tsx`**

```typescript
'use client'

import { motion } from 'framer-motion'
import { Channel } from '@/lib/channels'
import { ChannelCard } from './ChannelCard'

type Props = {
  channels: Channel[]
}

export function ChannelGrid({ channels }: Props) {
  return (
    <motion.div
      key={channels.map(c => c.id).join(',')}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
    >
      {channels.map(ch => (
        <ChannelCard key={ch.id} channel={ch} />
      ))}
    </motion.div>
  )
}
```

- [ ] **Step 5: Create `components/dashboard/AiInsightsBar.tsx`**

```typescript
'use client'

export function AiInsightsBar() {
  return (
    <div className="bg-surface/50 border border-border rounded-xl px-4 py-3 flex items-center gap-4 text-[11px]">
      <div className="flex items-center gap-1.5">
        <span className="text-sm">&#9889;</span>
        <span className="text-muted">AI Инсайты</span>
      </div>
      <div className="w-px h-4 bg-border" />
      <div className="flex items-center gap-1.5 cursor-pointer hover:text-cream text-muted transition-colors">
        <span className="bg-accent/15 text-accent text-[10px] font-medium px-1.5 py-0.5 rounded">3</span>
        <span>идеи для контента</span>
      </div>
      <div className="w-px h-4 bg-border" />
      <div className="flex items-center gap-1.5 cursor-pointer hover:text-cream text-muted transition-colors">
        <span className="bg-purple/15 text-purple text-[10px] font-medium px-1.5 py-0.5 rounded">2</span>
        <span>упоминания</span>
      </div>
      <div className="w-px h-4 bg-border" />
      <div className="flex items-center gap-1.5 cursor-pointer hover:text-cream text-muted transition-colors">
        <span className="bg-warn/15 text-warn text-[10px] font-medium px-1.5 py-0.5 rounded">1</span>
        <span>задача требует внимания</span>
      </div>
      <div className="ml-auto">
        <span className="text-[10px] text-dim cursor-pointer hover:text-muted transition-colors">
          Открыть &rarr;
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Verify build**

Run: `npx next build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add components/dashboard/
git commit -m "feat: add dashboard components (HeroMetrics, FilterTabs, ChannelCard, ChannelGrid, AiInsightsBar)"
```

---

### Task 6: Layout Integration + Dashboard Page

**Files:**
- Modify: `app/layout.tsx`
- Replace: `app/page.tsx`
- Modify: `app/youtube/page.tsx` (line 142: remove `min-h-screen bg-[#09090b]`)

- [ ] **Step 1: Update `app/layout.tsx` — wrap in sidebar**

```typescript
import type { Metadata } from 'next'
import './globals.css'
import { Sidebar } from '@/components/layout/Sidebar'

export const metadata: Metadata = {
  title: 'ContentOS',
  description: 'Content management system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className="dark">
      <body className="antialiased flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  )
}
```

- [ ] **Step 2: Fix `/youtube` page root div**

In `app/youtube/page.tsx` line 142, change:
```
<div className="min-h-screen bg-[#09090b] text-white font-sans">
```
to:
```
<div className="text-white font-sans">
```

Note: Only remove `min-h-screen` and `bg-[#09090b]` (layout provides these now). Keep `text-white` to preserve existing visual — full migration to CSS vars is a separate follow-up.

- [ ] **Step 3: Replace `app/page.tsx` with dashboard**

```typescript
'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { CHANNELS, Channel, aggregateMetrics, getUniquePlatforms, PLATFORM_LABELS } from '@/lib/channels'
import { HeroMetrics } from '@/components/dashboard/HeroMetrics'
import { FilterTabs } from '@/components/dashboard/FilterTabs'
import { ChannelGrid } from '@/components/dashboard/ChannelGrid'
import { AiInsightsBar } from '@/components/dashboard/AiInsightsBar'

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

function fmtNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return Math.round(n / 1_000).toLocaleString('ru-RU') + 'K'
  return n.toLocaleString('ru-RU')
}

export default function DashboardPage() {
  const supabaseRef = useRef<SupabaseClient | null>(null)
  if (!supabaseRef.current && typeof window !== 'undefined') {
    supabaseRef.current = getSupabase()
  }

  const [channels, setChannels] = useState<Channel[]>(CHANNELS)
  const [activeTab, setActiveTab] = useState('all')

  useEffect(() => {
    async function loadYouTubeStats() {
      const supabase = supabaseRef.current
      if (!supabase) return

      const { data: videos } = await supabase
        .from('yt_videos')
        .select('view_count, like_count, duration_seconds')

      if (!videos || videos.length === 0) return

      const totalViews = videos.reduce((s, v) => s + (v.view_count || 0), 0)
      const totalLikes = videos.reduce((s, v) => s + (v.like_count || 0), 0)
      const engagement = totalViews > 0 ? (totalLikes / totalViews) * 100 : undefined

      // For now, put all YT stats on the main channel
      setChannels(prev => prev.map(ch => {
        if (ch.id === 'yt-lichnaya-filosofiya') {
          return {
            ...ch,
            metrics: {
              subscribers: 66100,
              views: totalViews,
              contentCount: videos.length,
              growthPercent: 1.8,
              engagement,
            },
          }
        }
        return ch
      }))
    }

    loadYouTubeStats()
  }, [])

  const platforms = getUniquePlatforms(channels)
  const tabs = [
    { id: 'all', label: 'Все каналы', count: channels.length },
    ...platforms.map(p => ({
      id: p,
      label: PLATFORM_LABELS[p],
      count: channels.filter(c =>
        p === 'youtube' ? c.platform === 'youtube' || c.platform === 'youtube-shorts' : c.platform === p
      ).length,
    })),
  ]

  const filteredChannels = activeTab === 'all'
    ? channels
    : channels.filter(c =>
        activeTab === 'youtube'
          ? c.platform === 'youtube' || c.platform === 'youtube-shorts'
          : c.platform === activeTab
      )

  const agg = aggregateMetrics(channels)

  // NOTE: Growth percentages are hardcoded placeholders.
  // Real growth calculation requires storing historical snapshots (future feature).
  const heroMetrics = [
    {
      label: 'Подписчики',
      value: fmtNumber(agg.subscribers),
      color: 'var(--accent)',
      growth: agg.subscribers > 0 ? { value: '+2.3%', positive: true } : undefined,
    },
    {
      label: 'Просмотры',
      value: fmtNumber(agg.views),
      color: 'var(--purple)',
      growth: agg.views > 0 ? { value: '+4.1%', positive: true } : undefined,
    },
    {
      label: 'Контент',
      value: fmtNumber(agg.contentCount),
      color: 'var(--text-primary)',
    },
    {
      label: 'Engagement',
      value: agg.engagement != null ? agg.engagement.toFixed(1) + '%' : '--',
      color: 'var(--green)',
      growth: agg.engagement != null ? { value: '-0.2%', positive: false } : undefined,
    },
  ]

  return (
    <div className="px-6 py-5 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold text-cream">Денис Царюк</h1>
          <p className="text-[11px] text-muted mt-0.5">
            Медиа &bull; {channels.length} каналов &bull; {platforms.length} платформ
          </p>
        </div>
        <div className="text-[10px] text-dim bg-surface border border-border px-2.5 py-1 rounded-md">
          Обновлено 5 мин назад
        </div>
      </div>

      {/* Hero Metrics */}
      <div className="mb-6">
        <HeroMetrics metrics={heroMetrics} />
      </div>

      {/* Filter Tabs */}
      <div className="mb-5">
        <FilterTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      {/* Channel Grid */}
      <div className="mb-6">
        <ChannelGrid channels={filteredChannels} />
      </div>

      {/* AI Insights */}
      <AiInsightsBar />
    </div>
  )
}
```

- [ ] **Step 4: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds without errors.

- [ ] **Step 5: Run dev server and verify visually**

Run: `npx next dev`
- Open `http://localhost:3000` — should show dashboard with sidebar
- Open `http://localhost:3000/youtube` — should show existing YouTube page with sidebar
- Click theme toggle — should switch between dark/light
- Hover sidebar YouTube icon — should show flyout with channel names

- [ ] **Step 6: Commit**

```bash
git add app/layout.tsx app/page.tsx app/youtube/page.tsx
git commit -m "feat: integrate sidebar layout, dashboard page, and fix YouTube page"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Full build check**

Run: `npx next build 2>&1 | tail -20`
Expected: Build succeeds, no TypeScript errors.

- [ ] **Step 2: Visual QA checklist**

Run dev server and verify:
- [ ] Dashboard loads at `/`
- [ ] 4 hero metric cards visible
- [ ] Filter tabs filter the channel grid
- [ ] Connected channels show metrics
- [ ] Unconnected channels show placeholder
- [ ] AI Insights bar at bottom
- [ ] Sidebar icons visible, flyout on hover
- [ ] Theme toggle works (dark ↔ light)
- [ ] `/youtube` page works with sidebar
- [ ] No console errors

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address QA issues from final verification"
```
