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
