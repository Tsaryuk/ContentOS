'use client'

import { useState } from 'react'
import { Copy, Check, Send, MessageCircle, Camera } from 'lucide-react'

interface SocialDraft {
  platform: string
  content: string
}

const PLATFORMS: Record<string, { label: string; icon: any; color: string }> = {
  telegram: { label: 'Telegram', icon: Send, color: 'text-blue-400' },
  youtube_community: { label: 'YouTube', icon: MessageCircle, color: 'text-red-400' },
  instagram_stories: { label: 'Instagram', icon: Camera, color: 'text-pink-400' },
}

export function SocialPreview({
  drafts,
  onEdit,
}: {
  drafts: SocialDraft[]
  onEdit?: (platform: string, content: string) => void
}) {
  const [activeTab, setActiveTab] = useState(drafts[0]?.platform ?? 'telegram')
  const [copied, setCopied] = useState<string | null>(null)
  const [editedContent, setEditedContent] = useState<Record<string, string>>({})

  if (!drafts || drafts.length === 0) return null

  const activeDraft = drafts.find(d => d.platform === activeTab)
  const content = editedContent[activeTab] ?? activeDraft?.content ?? ''

  const handleCopy = async (platform: string) => {
    await navigator.clipboard.writeText(content)
    setCopied(platform)
    setTimeout(() => setCopied(null), 2000)
  }

  const handleContentChange = (value: string) => {
    setEditedContent({ ...editedContent, [activeTab]: value })
    onEdit?.(activeTab, value)
  }

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-3">
        {drafts.map(draft => {
          const platform = PLATFORMS[draft.platform] ?? { label: draft.platform, icon: Send, color: 'text-white/40' }
          const Icon = platform.icon
          const isActive = activeTab === draft.platform

          return (
            <button
              key={draft.platform}
              onClick={() => setActiveTab(draft.platform)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/60 hover:bg-white/5'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? platform.color : ''}`} />
              {platform.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {activeDraft && (
        <div>
          <textarea
            value={content}
            onChange={e => handleContentChange(e.target.value)}
            className="w-full min-h-[150px] p-3 bg-white/[0.03] border border-white/[0.08] rounded-xl text-sm text-white/80 leading-relaxed resize-y focus:outline-none focus:border-purple-500/30 placeholder:text-white/20"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-white/20">{content.length} символов</span>
            <button
              onClick={() => handleCopy(activeTab)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs text-white/60 hover:text-white transition-colors"
            >
              {copied === activeTab
                ? <><Check className="w-3.5 h-3.5 text-emerald-400" /> Скопировано</>
                : <><Copy className="w-3.5 h-3.5" /> Копировать</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
