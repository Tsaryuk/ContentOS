'use client'

import { useEffect, useState } from 'react'
import { Save, Loader2, Plus, X, ChevronDown, ChevronUp } from 'lucide-react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

interface ChannelRules {
  title_format: string
  description_template: string
  required_links: string[]
  hashtags_fixed: string[]
  thumbnail_style_id: string
  shorts_count: number
  clip_max_minutes: number
  brand_voice?: string
  social_templates?: {
    telegram?: string
    youtube_community?: string
    instagram_stories?: string
  }
}

interface Channel {
  id: string
  title: string
  handle: string
  yt_channel_id: string
  rules: ChannelRules
}

export default function SettingsPage() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, ChannelRules>>({})
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_KEY) { setLoading(false); return }
    fetch(`${SUPABASE_URL}/rest/v1/yt_channels?select=*`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setChannels(data)
          const initial: Record<string, ChannelRules> = {}
          for (const ch of data) initial[ch.id] = { ...ch.rules }
          setDrafts(initial)
          if (data.length > 0) setExpanded(data[0].id)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function updateDraft(channelId: string, patch: Partial<ChannelRules>) {
    setDrafts(prev => ({ ...prev, [channelId]: { ...prev[channelId], ...patch } }))
  }

  function updateLink(channelId: string, index: number, value: string) {
    const links = [...(drafts[channelId]?.required_links ?? [])]
    links[index] = value
    updateDraft(channelId, { required_links: links })
  }

  function addLink(channelId: string) {
    const links = [...(drafts[channelId]?.required_links ?? []), '']
    updateDraft(channelId, { required_links: links })
  }

  function removeLink(channelId: string, index: number) {
    const links = (drafts[channelId]?.required_links ?? []).filter((_, i) => i !== index)
    updateDraft(channelId, { required_links: links })
  }

  function updateHashtag(channelId: string, index: number, value: string) {
    const tags = [...(drafts[channelId]?.hashtags_fixed ?? [])]
    tags[index] = value
    updateDraft(channelId, { hashtags_fixed: tags })
  }

  function addHashtag(channelId: string) {
    const tags = [...(drafts[channelId]?.hashtags_fixed ?? []), '']
    updateDraft(channelId, { hashtags_fixed: tags })
  }

  function removeHashtag(channelId: string, index: number) {
    const tags = (drafts[channelId]?.hashtags_fixed ?? []).filter((_, i) => i !== index)
    updateDraft(channelId, { hashtags_fixed: tags })
  }

  async function save(channelId: string) {
    setSaving(channelId)
    try {
      const rules = drafts[channelId]
      const res = await fetch(`${SUPABASE_URL}/rest/v1/yt_channels?id=eq.${channelId}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ rules }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSaved(channelId)
      setTimeout(() => setSaved(null), 2000)
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-white/30" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-white font-sans">
      <div className="border-b border-white/[0.06] px-6 py-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-white/40">ContentOS</span>
          <span className="text-white/20">/</span>
          <span className="font-medium">Настройки каналов</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-3">
        {channels.length === 0 && (
          <div className="py-20 text-center text-white/30 text-sm">
            Каналы не найдены. Синхронизируйте сначала на странице YouTube.
          </div>
        )}

        {channels.map(ch => {
          const draft = drafts[ch.id] ?? ch.rules
          const isExpanded = expanded === ch.id
          const isSaving = saving === ch.id
          const isSaved = saved === ch.id

          return (
            <div key={ch.id} className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
              {/* Header */}
              <button
                onClick={() => setExpanded(isExpanded ? null : ch.id)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center">
                    <span className="text-red-400 text-xs font-bold">YT</span>
                  </div>
                  <div className="text-left">
                    <div className="text-sm font-medium">{ch.title}</div>
                    <div className="text-xs text-white/40">{ch.handle}</div>
                  </div>
                </div>
                {isExpanded ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 space-y-5 border-t border-white/[0.06]">

                  {/* Title Format */}
                  <div className="pt-4 space-y-1.5">
                    <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Формат заголовка</label>
                    <textarea
                      value={draft.title_format ?? ''}
                      onChange={e => updateDraft(ch.id, { title_format: e.target.value })}
                      rows={2}
                      placeholder="Пример: {guest}: {topic}"
                      className="w-full px-3 py-2 bg-black/30 border border-white/[0.06] rounded-lg text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/15 resize-none"
                    />
                  </div>

                  {/* Description Template */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Шаблон описания</label>
                    <textarea
                      value={draft.description_template ?? ''}
                      onChange={e => updateDraft(ch.id, { description_template: e.target.value })}
                      rows={5}
                      placeholder="Шаблон описания с плейсхолдерами: {summary}, {guest_name}, {guest_links}, {host_links}, {sponsor_links}"
                      className="w-full px-3 py-2 bg-black/30 border border-white/[0.06] rounded-lg text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/15 resize-none font-mono text-xs leading-relaxed"
                    />
                    <p className="text-[11px] text-white/30">Плейсхолдеры: {'{summary}'}, {'{guest_name}'}, {'{guest_links}'}, {'{host_links}'}, {'{sponsor_links}'}, {'{timecodes}'}</p>
                  </div>

                  {/* Required Links */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Обязательные ссылки</label>
                    <p className="text-[11px] text-white/30">Ссылки на хоста, ключевой ресурс, соцсети — добавляются в конец каждого описания</p>
                    <div className="space-y-2">
                      {(draft.required_links ?? []).map((link, i) => (
                        <div key={i} className="flex gap-2">
                          <input
                            value={link}
                            onChange={e => updateLink(ch.id, i, e.target.value)}
                            placeholder="https://... или текст ссылки"
                            className="flex-1 px-3 py-2 bg-black/30 border border-white/[0.06] rounded-lg text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/15"
                          />
                          <button
                            onClick={() => removeLink(ch.id, i)}
                            className="p-2 text-white/20 hover:text-red-400 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addLink(ch.id)}
                        className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Добавить ссылку
                      </button>
                    </div>
                  </div>

                  {/* Hashtags */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Фиксированные хештеги</label>
                    <div className="flex flex-wrap gap-2">
                      {(draft.hashtags_fixed ?? []).map((tag, i) => (
                        <div key={i} className="flex items-center gap-1 bg-white/5 border border-white/[0.06] rounded-full px-2.5 py-1">
                          <input
                            value={tag}
                            onChange={e => updateHashtag(ch.id, i, e.target.value)}
                            className="bg-transparent text-xs text-white/70 focus:outline-none w-24"
                          />
                          <button onClick={() => removeHashtag(ch.id, i)} className="text-white/20 hover:text-white/50">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addHashtag(ch.id)}
                        className="flex items-center gap-1 text-xs text-white/30 hover:text-white/50 border border-dashed border-white/10 rounded-full px-2.5 py-1 transition-colors"
                      >
                        <Plus className="w-3 h-3" /> хештег
                      </button>
                    </div>
                  </div>

                  {/* Brand Voice */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Голос бренда</label>
                    <textarea
                      value={draft.brand_voice ?? ''}
                      onChange={e => updateDraft(ch.id, { brand_voice: e.target.value })}
                      rows={3}
                      placeholder="Описание стиля и тона канала для AI-генерации..."
                      className="w-full px-3 py-2 bg-black/30 border border-white/[0.06] rounded-lg text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-white/15 resize-none"
                    />
                  </div>

                  {/* Social Templates */}
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Шаблоны соцсетей</label>
                    <div className="space-y-2">
                      <div>
                        <label className="text-[11px] text-white/30 mb-1 block">Telegram</label>
                        <textarea
                          value={draft.social_templates?.telegram ?? ''}
                          onChange={e => updateDraft(ch.id, { social_templates: { ...draft.social_templates, telegram: e.target.value } })}
                          rows={2}
                          placeholder="Формат поста в Telegram-канал"
                          className="w-full px-3 py-2 bg-black/30 border border-white/[0.06] rounded-lg text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/15 resize-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-white/30 mb-1 block">YouTube Community</label>
                        <textarea
                          value={draft.social_templates?.youtube_community ?? ''}
                          onChange={e => updateDraft(ch.id, { social_templates: { ...draft.social_templates, youtube_community: e.target.value } })}
                          rows={2}
                          placeholder="Формат поста в Community Tab"
                          className="w-full px-3 py-2 bg-black/30 border border-white/[0.06] rounded-lg text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/15 resize-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-white/30 mb-1 block">Instagram Stories</label>
                        <textarea
                          value={draft.social_templates?.instagram_stories ?? ''}
                          onChange={e => updateDraft(ch.id, { social_templates: { ...draft.social_templates, instagram_stories: e.target.value } })}
                          rows={2}
                          placeholder="Формат текста для Stories"
                          className="w-full px-3 py-2 bg-black/30 border border-white/[0.06] rounded-lg text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-white/15 resize-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Clip/Short Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Кол-во Shorts</label>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={draft.shorts_count ?? 3}
                        onChange={e => updateDraft(ch.id, { shorts_count: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-black/30 border border-white/[0.06] rounded-lg text-sm text-white focus:outline-none focus:border-white/15"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-white/50 uppercase tracking-wider">Макс. клип (мин)</label>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={draft.clip_max_minutes ?? 20}
                        onChange={e => updateDraft(ch.id, { clip_max_minutes: parseInt(e.target.value) || 20 })}
                        className="w-full px-3 py-2 bg-black/30 border border-white/[0.06] rounded-lg text-sm text-white focus:outline-none focus:border-white/15"
                      />
                    </div>
                  </div>

                  {/* Save */}
                  <div className="pt-2">
                    <button
                      onClick={() => save(ch.id)}
                      disabled={isSaving}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isSaved
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-white text-black hover:bg-white/90 disabled:opacity-50'
                      }`}
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {isSaved ? 'Сохранено' : isSaving ? 'Сохранение...' : 'Сохранить'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
