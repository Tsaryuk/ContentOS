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
