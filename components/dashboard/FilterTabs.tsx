'use client'

import { motion } from 'framer-motion'

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
    <div className="inline-flex items-center gap-1 p-1 rounded-full bg-surface border border-border">
      {tabs.map(tab => {
        const active = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="relative px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors"
          >
            {active && (
              <motion.div
                layoutId="dashboardTab"
                className="absolute inset-0 rounded-full bg-accent/15 border border-accent/30"
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              />
            )}
            <span className={`relative z-10 ${active ? 'text-accent' : 'text-muted hover:text-cream'}`}>
              {tab.label}
              <span className={`ml-1.5 ${active ? 'text-accent/70' : 'text-dim'}`}>{tab.count}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
