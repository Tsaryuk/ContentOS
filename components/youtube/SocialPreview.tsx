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
          const platform = PLATFORMS[draft.platform] ?? { label: draft.platform, icon: Send, color: 'text-muted-foreground' }
          const Icon = platform.icon
          const isActive = activeTab === draft.platform

          return (
            <button
              key={draft.platform}
              onClick={() => setActiveTab(draft.platform)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-card border border-border text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-card'
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
            className="w-full min-h-[150px] p-3 bg-card border border-border rounded-xl text-sm text-foreground leading-relaxed resize-y focus:outline-none focus:border-purple-500/30 placeholder:text-muted-foreground/60"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[10px] text-muted-foreground/60">{content.length} символов</span>
            <button
              onClick={() => handleCopy(activeTab)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border hover:bg-accent-surface text-xs text-muted-foreground hover:text-foreground transition-colors"
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
