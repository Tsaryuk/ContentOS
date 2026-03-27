import { Mail, Globe, Play, Send, Camera } from 'lucide-react'
import { Platform } from './channels'

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
  'youtube':        <Play className="w-[18px] h-[18px]" />,
  'youtube-shorts': <Play className="w-[18px] h-[18px]" />,
  'telegram':       <Send className="w-[18px] h-[18px]" />,
  'instagram':      <Camera className="w-[18px] h-[18px]" />,
  'tiktok':         <TikTokIcon />,
  'threads':        <ThreadsIcon />,
  'email':          <Mail className="w-[18px] h-[18px]" />,
  'website':        <Globe className="w-[18px] h-[18px]" />,
}
