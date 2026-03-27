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
  icon?: string
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
    metrics: null,
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
