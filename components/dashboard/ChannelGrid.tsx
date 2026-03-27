'use client'

import { motion } from 'framer-motion'
import { Channel } from '@/lib/channels'
import { ChannelCard } from './ChannelCard'

export function ChannelGrid({ channels }: { channels: Channel[] }) {
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
