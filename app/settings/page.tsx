'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Save, Loader2, Plus, X, ChevronDown, ChevronUp,
  Play, FolderOpen, User, Check, LogOut, Trash2, RotateCcw,
  AlertCircle, Cog, Mic, Copy, Download,
} from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Project { id: string; name: string; color: string; slug: string }
interface Channel {
  id: string; title: string; handle: string | null
  thumbnail_url: string | null; project_id: string | null
  yt_channel_id: string; google_account_id: string | null
  needs_reauth?: boolean
  rules?: ChannelRules
}
interface TgChannel { id: string; title: string; username: string | null; project_id: string | null }
interface PodcastShow {
  id: string
  channel_id: string | null
  slug: string
  title: string
  description: string | null
  author: string | null
  owner_email: string | null
  owner_name: string | null
  language: string
  category: string | null
  subcategory: string | null
  cover_url: string | null
  cover_style_prompt: string | null
  explicit: boolean
  default_trim_start_sec: number
  default_trim_end_sec: number
  auto_publish: boolean
  is_active: boolean
}
interface GoogleAccount { id: string; email: string; name: string; picture: string | null }
interface ChannelRules {
  title_format: string; description_template: string
  required_links: string[]; hashtags_fixed: string[]
  shorts_count: number; clip_max_minutes: number
  brand_voice?: string
  thumbnail_style_prompt?: string
  channel_links?: string
  social_templates?: { telegram?: string; youtube_community?: string; instagram_stories?: string }
}

const DEFAULT_RULES: ChannelRules = {
  title_format: '', description_template: '',
  required_links: [], hashtags_fixed: [],
  shorts_count: 3, clip_max_minutes: 10,
}

const inputClass = 'w-full h-9 px-3 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'
const textareaClass = 'w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none'
const labelClass = 'text-[10px] text-muted-foreground uppercase tracking-wider font-medium'

function OAuthBanner() {
  const params = useSearchParams()
  const ok = params.get('oauth_ok')
  const email = params.get('email')
  const channels = params.get('channels')
  const err = params.get('oauth_error')
  if (!ok && !err) return null
  return (
    <div className={`mb-6 px-4 py-3 rounded-xl border text-sm flex items-center gap-2 ${
      ok
        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-300'
        : 'bg-destructive/10 border-destructive/20 text-destructive'
    }`}>
      {ok ? <Check className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
      {ok
        ? `Google-аккаунт ${email} подключён. Найдено каналов: ${channels}.`
        : `Ошибка: ${err}`}
    </div>
  )
}

export default function SettingsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [tgChannels, setTgChannels] = useState<TgChannel[]>([])
  const [accounts, setAccounts] = useState<GoogleAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<'accounts' | 'projects' | 'channels' | 'podcasts'>('accounts')
  const [sessionRole, setSessionRole] = useState<string | null>(null)

  // Project form
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectColor, setNewProjectColor] = useState('#a67ff0')
  const [creatingProject, setCreatingProject] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [editingProjectName, setEditingProjectName] = useState('')
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null)

  // Podcasts
  const [podcasts, setPodcasts] = useState<PodcastShow[]>([])
  const [savingPodcastId, setSavingPodcastId] = useState<string | null>(null)
  const [copiedRssId, setCopiedRssId] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [addChannelId, setAddChannelId] = useState('')
  const [addChannelProject, setAddChannelProject] = useState('')
  const [addingChannel, setAddingChannel] = useState(false)
  const [addChannelError, setAddChannelError] = useState('')
  const [deletingChannel, setDeletingChannel] = useState<string | null>(null)
  const [refreshingChannel, setRefreshingChannel] = useState<string | null>(null)
  const [downloadingChannel, setDownloadingChannel] = useState<string | null>(null)

  // Channel rules
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, ChannelRules>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    loadData()
    fetch('/api/auth/session').then(r => r.json()).then(s => setSessionRole(s.userRole))
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [projRes, accRes, podRes] = await Promise.all([
        fetch('/api/projects?all=true'),
        fetch('/api/accounts'),
        fetch('/api/podcasts'),
      ])
      const { projects: p, channels: c, tgChannels: tg } = await projRes.json()
      setProjects(p ?? [])
      setChannels(c ?? [])
      setTgChannels(tg ?? [])
      const initial: Record<string, ChannelRules> = {}
      for (const ch of (c ?? [])) initial[ch.id] = { ...DEFAULT_RULES, ...(ch.rules ?? {}) }
      setDrafts(initial)

      if (accRes.ok) {
        const { accounts: a } = await accRes.json()
        if (Array.isArray(a)) setAccounts(a)
      }

      if (podRes.ok) {
        const { shows } = await podRes.json()
        setPodcasts(shows ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  async function updatePodcast(id: string, patch: Partial<PodcastShow>) {
    setSavingPodcastId(id)
    const res = await fetch(`/api/podcasts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const updated = await res.json()
      setPodcasts(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p))
    } else {
      const data = await res.json().catch(() => ({}))
      alert('Не удалось обновить шоу: ' + (data.error ?? res.status))
    }
    setSavingPodcastId(null)
  }

  async function createProject() {
    if (!newProjectName.trim()) return
    setCreatingProject(true)
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newProjectName.trim(), color: newProjectColor }),
    })
    if (res.ok) {
      setNewProjectName('')
      await loadData()
    }
    setCreatingProject(false)
  }

  async function updateProject(id: string, patch: { name?: string; color?: string }) {
    setSavingProjectId(id)
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const updated = await res.json()
      setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p))
    } else {
      const data = await res.json().catch(() => ({}))
      alert('Не удалось обновить проект: ' + (data.error ?? res.status))
    }
    setSavingProjectId(null)
  }

  function startEditingProject(p: Project) {
    setEditingProjectId(p.id)
    setEditingProjectName(p.name)
  }

  async function commitEditingProject() {
    if (!editingProjectId) return
    const name = editingProjectName.trim()
    const current = projects.find(p => p.id === editingProjectId)
    if (current && name && name !== current.name) {
      await updateProject(editingProjectId, { name })
    }
    setEditingProjectId(null)
    setEditingProjectName('')
  }

  async function disconnectAccount(id: string) {
    if (!confirm('Отключить этот Google-аккаунт?')) return
    setDisconnecting(id)
    await fetch(`/api/accounts/${id}`, { method: 'DELETE' })
    setDisconnecting(null)
    await loadData()
  }

  async function addChannelById() {
    const id = addChannelId.trim().replace(/.*channel\//, '').replace(/\/.*/, '')
    if (!id) return
    setAddingChannel(true)
    setAddChannelError('')
    const res = await fetch('/api/channels/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ytChannelId: id, projectId: addChannelProject || null }),
    })
    const data = await res.json()
    if (!res.ok) { setAddChannelError(data.error); setAddingChannel(false); return }
    setAddChannelId('')
    await loadData()
    setAddingChannel(false)
  }

  async function deleteChannel(channelId: string) {
    if (!confirm('Удалить канал из системы?')) return
    setDeletingChannel(channelId)
    await fetch(`/api/channels/${channelId}`, { method: 'DELETE' })
    setChannels(prev => prev.filter(c => c.id !== channelId))
    setDeletingChannel(null)
  }

  async function refreshChannel(channelId: string) {
    setRefreshingChannel(channelId)
    const res = await fetch(`/api/channels/${channelId}/refresh`, { method: 'POST' })
    const data = await res.json()
    if (data.ok) {
      setChannels(prev => prev.map(c =>
        c.id === channelId
          ? { ...c, title: data.title, handle: data.handle, thumbnail_url: data.thumbnail_url }
          : c
      ))
    }
    setRefreshingChannel(null)
  }

  async function downloadTranscripts(channelId: string, channelTitle: string) {
    setDownloadingChannel(channelId)
    try {
      const res = await fetch(`/api/channels/${channelId}/transcripts/zip`)
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(`Не удалось скачать транскрипты: ${data.error ?? res.status}`)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const safe = channelTitle.replace(/[\s/]+/g, '_')
      const stamp = new Date().toISOString().slice(0, 10)
      a.download = `transcripts_${safe}_${stamp}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(`Ошибка: ${err instanceof Error ? err.message : 'unknown'}`)
    } finally {
      setDownloadingChannel(null)
    }
  }

  async function assignToProject(channelId: string, projectId: string | null, type: 'yt' | 'tg' = 'yt') {
    await fetch('/api/projects/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, projectId, type }),
    })
    if (type === 'tg') {
      setTgChannels(prev => prev.map(c => c.id === channelId ? { ...c, project_id: projectId } : c))
    } else {
      setChannels(prev => prev.map(c => c.id === channelId ? { ...c, project_id: projectId } : c))
    }
  }

  function updateDraft(channelId: string, patch: Partial<ChannelRules>) {
    setDrafts(prev => ({ ...prev, [channelId]: { ...prev[channelId], ...patch } }))
  }

  async function saveRules(channelId: string) {
    setSaving(channelId)
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: drafts[channelId] }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSaved(channelId)
      setTimeout(() => setSaved(null), 2000)
    } finally { setSaving(null) }
  }

  const SECTIONS = [
    { id: 'accounts' as const, label: 'Google аккаунты', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'projects' as const, label: 'Проекты', icon: <FolderOpen className="w-3.5 h-3.5" /> },
    { id: 'channels' as const, label: 'Каналы', icon: <Play className="w-3.5 h-3.5" /> },
    { id: 'podcasts' as const, label: 'Подкасты', icon: <Mic className="w-3.5 h-3.5" /> },
  ]

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  )

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight">Настройки</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {accounts.length} {accounts.length === 1 ? 'аккаунт' : accounts.length < 5 ? 'аккаунта' : 'аккаунтов'} · {channels.length} YT · {tgChannels.length} TG · {projects.length} {projects.length === 1 ? 'проект' : 'проекта'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sessionRole === 'admin' && (
            <Button variant="outline" asChild>
              <Link href="/admin">
                <Cog />
                Админка
              </Link>
            </Button>
          )}
          <Button variant="brand" asChild>
            <a href="/api/auth/start">
              <Play />
              Подключить Google
            </a>
          </Button>
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' })
              window.location.href = '/login'
            }}
          >
            <LogOut />
            Выйти
          </Button>
        </div>
      </header>

      <Suspense fallback={null}><OAuthBanner /></Suspense>

      {/* Reauth warning */}
      {channels.some(c => c.needs_reauth) && (
        <div className="mb-4 px-4 py-3 rounded-xl border bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>
            {channels.filter(c => c.needs_reauth).map(c => c.title).join(', ')} — токен истёк. Переподключите Google-аккаунт.
          </span>
          <a
            href="/api/auth/start"
            className="ml-auto shrink-0 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-700 dark:text-amber-200 text-xs font-medium transition-colors"
          >
            Переподключить
          </a>
        </div>
      )}

      {/* Section tabs */}
      <div className="inline-flex items-center gap-0.5 p-0.5 mb-6 rounded-lg bg-card border border-border">
        {SECTIONS.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSection(s.id)}
            data-active={activeSection === s.id || undefined}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors text-muted-foreground hover:text-foreground data-[active]:bg-muted data-[active]:text-foreground"
          >
            {s.icon}{s.label}
          </button>
        ))}
      </div>

      {/* ── ACCOUNTS ── */}
      {activeSection === 'accounts' && (
        <div className="space-y-3">
          <Card className="bg-accent/5 border-accent/20 p-4 text-xs text-muted-foreground leading-relaxed">
            Каждый YouTube-канал (бренд-аккаунт) подключается отдельно. Нажми «Подключить Google» вверху → выбери нужный аккаунт → он появится здесь как отдельная строка.
          </Card>

          {accounts.length === 0 ? (
            <Card className="p-12 flex flex-col items-center justify-center text-center">
              <User className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-foreground font-medium mb-1">Нет подключённых аккаунтов</p>
              <p className="text-sm text-muted-foreground">Подключи Google-аккаунт, чтобы начать</p>
            </Card>
          ) : (
            accounts.map(acc => {
              const accChannels = channels.filter(c => c.google_account_id === acc.id)
              const ch = accChannels[0]
              const isBrand = acc.email?.includes('pages.plusgoogle.com')
              const needsReauth = accChannels.some(c => c.needs_reauth)
              return (
                <Card key={acc.id} className="flex items-center gap-4 p-4">
                  {ch?.thumbnail_url
                    ? <img src={ch.thumbnail_url} className="w-10 h-10 rounded-full shrink-0" alt="" />
                    : acc.picture
                      ? <img src={acc.picture} className="w-10 h-10 rounded-full shrink-0" alt="" />
                      : <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-semibold text-sm shrink-0">{acc.name?.[0]}</div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {ch?.title ?? acc.name}
                    </div>
                    {ch?.handle && (
                      <div className="text-xs text-muted-foreground">{ch.handle}</div>
                    )}
                    {!isBrand && (
                      <div className="text-[11px] text-muted-foreground/70">{acc.email}</div>
                    )}
                  </div>
                  {needsReauth ? (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-300 shrink-0 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Токен истёк
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 shrink-0">
                      Подключён
                    </span>
                  )}
                  {needsReauth && (
                    <Button
                      asChild
                      variant="brand"
                      size="sm"
                      className="shrink-0"
                    >
                      <a href="/api/auth/start">Переподключить</a>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disconnectAccount(acc.id)}
                    disabled={disconnecting === acc.id}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    {disconnecting === acc.id ? <Loader2 className="animate-spin" /> : 'Отключить'}
                  </Button>
                </Card>
              )
            })
          )}
        </div>
      )}

      {/* ── PROJECTS ── */}
      {activeSection === 'projects' && (
        <div className="space-y-4">
          {/* Create project */}
          <Card className="p-4">
            <div className={`${labelClass} mb-3`}>Новый проект</div>
            <div className="flex gap-2">
              <input
                value={newProjectColor}
                onChange={e => setNewProjectColor(e.target.value)}
                type="color"
                className="w-10 h-9 rounded-lg border border-border cursor-pointer bg-transparent"
              />
              <input
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createProject()}
                placeholder="Название проекта…"
                className={`flex-1 ${inputClass}`}
              />
              <Button
                variant="brand"
                onClick={createProject}
                disabled={creatingProject || !newProjectName.trim()}
              >
                {creatingProject ? <Loader2 className="animate-spin" /> : <Plus />}
                Создать
              </Button>
            </div>
          </Card>

          {/* Project list */}
          {projects.map(proj => {
            const projYtChannels = channels.filter(c => c.project_id === proj.id)
            const projTgChannels = tgChannels.filter(c => c.project_id === proj.id)
            const totalChannels = projYtChannels.length + projTgChannels.length
            return (
              <Card key={proj.id} className="overflow-hidden">
                <div className="px-5 py-3 flex items-center gap-3">
                  <label className="relative w-3 h-3 rounded-full shrink-0 cursor-pointer" style={{ background: proj.color }} title="Сменить цвет">
                    <input
                      type="color"
                      value={proj.color}
                      onChange={e => updateProject(proj.id, { color: e.target.value })}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </label>
                  {editingProjectId === proj.id ? (
                    <input
                      autoFocus
                      value={editingProjectName}
                      onChange={e => setEditingProjectName(e.target.value)}
                      onBlur={commitEditingProject}
                      onKeyDown={e => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                        else if (e.key === 'Escape') { setEditingProjectId(null); setEditingProjectName('') }
                      }}
                      className="flex-1 h-7 px-2 rounded bg-background border border-ring/50 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  ) : (
                    <button
                      onClick={() => startEditingProject(proj)}
                      title="Переименовать"
                      className="text-sm font-medium text-foreground text-left hover:text-accent transition-colors"
                    >
                      {proj.name}
                    </button>
                  )}
                  {savingProjectId === proj.id && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                  <span className="text-xs text-muted-foreground ml-auto tabular-nums">{totalChannels} кан.</span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={async () => {
                      if (!confirm(`Удалить проект "${proj.name}"? Каналы останутся без проекта.`)) return
                      for (const ch of projYtChannels) {
                        await assignToProject(ch.id, null, 'yt')
                      }
                      for (const ch of projTgChannels) {
                        await assignToProject(ch.id, null, 'tg')
                      }
                      await fetch(`/api/projects/${proj.id}`, { method: 'DELETE' })
                      await loadData()
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {totalChannels > 0 && (
                  <div className="border-t border-border px-5 py-2 space-y-1.5">
                    {projYtChannels.map(ch => (
                      <div key={ch.id} className="flex items-center gap-2 py-1">
                        {ch.thumbnail_url
                          ? <img src={ch.thumbnail_url} className="w-6 h-6 rounded-full" alt="" />
                          : <div className="w-6 h-6 rounded-full bg-red-500/15 flex items-center justify-center text-[9px] text-red-500 font-bold">YT</div>
                        }
                        <span className="text-xs text-foreground flex-1 truncate">{ch.title}</span>
                        <span className="text-[10px] text-muted-foreground">{ch.handle}</span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => assignToProject(ch.id, null, 'yt')}
                          title="Убрать из проекта"
                        >
                          <X />
                        </Button>
                      </div>
                    ))}
                    {projTgChannels.map(ch => (
                      <div key={ch.id} className="flex items-center gap-2 py-1">
                        <div className="w-6 h-6 rounded-full bg-sky-500/15 flex items-center justify-center text-[9px] text-sky-500 font-bold">TG</div>
                        <span className="text-xs text-foreground flex-1 truncate">{ch.title}</span>
                        <span className="text-[10px] text-muted-foreground">{ch.username ? `@${ch.username}` : ''}</span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => assignToProject(ch.id, null, 'tg')}
                          title="Убрать из проекта"
                        >
                          <X />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}

          {/* Unassigned channels */}
          {(() => {
            const unassignedYt = channels.filter(c => !c.project_id)
            const unassignedTg = tgChannels.filter(c => !c.project_id)
            const totalUnassigned = unassignedYt.length + unassignedTg.length
            if (totalUnassigned === 0) return null
            return (
              <Card className="overflow-hidden">
                <div className="px-5 py-3 flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0 bg-muted-foreground/30" />
                  <span className="text-sm font-medium text-muted-foreground">Без проекта</span>
                  <span className="text-xs text-muted-foreground ml-auto tabular-nums">{totalUnassigned} кан.</span>
                </div>
                <div className="border-t border-border px-5 py-2 space-y-1.5">
                  {unassignedYt.map(ch => (
                    <div key={ch.id} className="flex items-center gap-2 py-1">
                      {ch.thumbnail_url
                        ? <img src={ch.thumbnail_url} className="w-6 h-6 rounded-full" alt="" />
                        : <div className="w-6 h-6 rounded-full bg-red-500/15 flex items-center justify-center text-[9px] text-red-500 font-bold">YT</div>
                      }
                      <span className="text-xs text-foreground flex-1 truncate">{ch.title}</span>
                      <select
                        onChange={e => { if (e.target.value) assignToProject(ch.id, e.target.value, 'yt') }}
                        className="text-[10px] h-7 px-2 rounded-md bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        defaultValue=""
                      >
                        <option value="">Добавить в…</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  ))}
                  {unassignedTg.map(ch => (
                    <div key={ch.id} className="flex items-center gap-2 py-1">
                      <div className="w-6 h-6 rounded-full bg-sky-500/15 flex items-center justify-center text-[9px] text-sky-500 font-bold">TG</div>
                      <span className="text-xs text-foreground flex-1 truncate">{ch.title}</span>
                      <select
                        onChange={e => { if (e.target.value) assignToProject(ch.id, e.target.value, 'tg') }}
                        className="text-[10px] h-7 px-2 rounded-md bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        defaultValue=""
                      >
                        <option value="">Добавить в…</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </Card>
            )
          })()}
        </div>
      )}

      {/* ── CHANNELS ── */}
      {activeSection === 'channels' && (
        <div className="space-y-3">
          {/* Add channel by ID */}
          <Card className="p-4">
            <div className={`${labelClass} mb-3`}>Добавить канал по ID</div>
            <div className="flex gap-2 mb-2">
              <input
                value={addChannelId}
                onChange={e => setAddChannelId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addChannelById()}
                placeholder="UCaaZTPOISLwBKogX2iBmetQ или ссылка"
                className={`flex-1 ${inputClass}`}
              />
              <select
                value={addChannelProject}
                onChange={e => setAddChannelProject(e.target.value)}
                className="h-9 px-2 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring max-w-[150px]"
              >
                <option value="">— проект —</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <Button
                variant="brand"
                onClick={addChannelById}
                disabled={addingChannel || !addChannelId.trim()}
              >
                {addingChannel ? <Loader2 className="animate-spin" /> : <Plus />}
                Добавить
              </Button>
            </div>
            {addChannelError && <div className="text-xs text-destructive">{addChannelError}</div>}
          </Card>

          {channels.length === 0 && (
            <Card className="p-12 flex flex-col items-center justify-center text-center">
              <Play className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-foreground font-medium mb-1">Нет каналов</p>
              <p className="text-sm text-muted-foreground">Подключи Google-аккаунт или добавь канал по ID выше</p>
            </Card>
          )}

          {channels.map(ch => {
            const draft = drafts[ch.id] ?? DEFAULT_RULES
            const isExpanded = expandedChannel === ch.id

            return (
              <Card key={ch.id} className="overflow-hidden">
                {/* Channel header */}
                <div className="px-5 py-3 flex items-center gap-3">
                  {ch.thumbnail_url
                    ? <img src={ch.thumbnail_url} className="w-8 h-8 rounded-full shrink-0" alt="" />
                    : <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center text-xs text-red-500 font-bold shrink-0">YT</div>
                  }
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground flex items-center gap-2">
                      <span className="truncate">{ch.title}</span>
                      {ch.needs_reauth && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-600 dark:text-amber-300 shrink-0">
                          Переподключить
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{ch.handle}</div>
                  </div>

                  <select
                    value={ch.project_id ?? ''}
                    onChange={e => assignToProject(ch.id, e.target.value || null)}
                    className="h-8 px-2 rounded-md bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring max-w-[150px]"
                  >
                    <option value="">— без проекта —</option>
                    {projects.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => downloadTranscripts(ch.id, ch.title)}
                    disabled={downloadingChannel === ch.id}
                    title="Скачать ZIP с транскриптами всех видео канала"
                    className="text-muted-foreground"
                  >
                    {downloadingChannel === ch.id
                      ? <Loader2 className="animate-spin" />
                      : <Download />}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => refreshChannel(ch.id)}
                    disabled={refreshingChannel === ch.id}
                    title="Обновить название и аватар с YouTube"
                    className="text-muted-foreground"
                  >
                    {refreshingChannel === ch.id
                      ? <Loader2 className="animate-spin" />
                      : <RotateCcw />}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => deleteChannel(ch.id)}
                    disabled={deletingChannel === ch.id}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {deletingChannel === ch.id
                      ? <Loader2 className="animate-spin" />
                      : <Trash2 />}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setExpandedChannel(isExpanded ? null : ch.id)}
                    className="text-muted-foreground"
                  >
                    {isExpanded ? <ChevronUp /> : <ChevronDown />}
                  </Button>
                </div>

                {/* Channel rules */}
                {isExpanded && (
                  <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">
                    <div className="space-y-1.5">
                      <label className={labelClass}>Формат заголовка</label>
                      <input
                        value={draft.title_format ?? ''}
                        onChange={e => updateDraft(ch.id, { title_format: e.target.value })}
                        placeholder="например: {title} | Подкаст"
                        className={inputClass}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className={labelClass}>Шаблон описания</label>
                      <textarea
                        value={draft.description_template ?? ''}
                        onChange={e => updateDraft(ch.id, { description_template: e.target.value })}
                        rows={3}
                        placeholder="Шаблон описания видео…"
                        className={textareaClass}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className={labelClass}>Постоянные ссылки</label>
                      {(draft.required_links ?? []).map((link, i) => (
                        <div key={i} className="flex gap-2">
                          <input
                            value={link}
                            onChange={e => {
                              const links = [...draft.required_links]
                              links[i] = e.target.value
                              updateDraft(ch.id, { required_links: links })
                            }}
                            placeholder="https://…"
                            className={`flex-1 ${inputClass}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => updateDraft(ch.id, { required_links: draft.required_links.filter((_, j) => j !== i) })}
                          >
                            <X />
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        onClick={() => updateDraft(ch.id, { required_links: [...(draft.required_links ?? []), ''] })}
                      >
                        <Plus /> Добавить ссылку
                      </Button>
                    </div>

                    <div className="space-y-1.5">
                      <label className={labelClass}>Фиксированные ссылки канала</label>
                      <textarea
                        rows={4}
                        value={draft.channel_links ?? ''}
                        onChange={e => updateDraft(ch.id, { channel_links: e.target.value })}
                        placeholder={'▶︎ конспекты подкастов — https://t.me/...\n▶︎ Instagram — https://instagram.com/...\nРеклама: hi@example.com'}
                        className={`${textareaClass} font-mono text-xs`}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className={labelClass}>Стиль обложки (промпт)</label>
                      <textarea
                        rows={2}
                        value={draft.thumbnail_style_prompt ?? ''}
                        onChange={e => updateDraft(ch.id, { thumbnail_style_prompt: e.target.value })}
                        placeholder="например: тёмный фон с зелёным свечением, крупные лица…"
                        className={textareaClass}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className={labelClass}>Shorts в день</label>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          value={draft.shorts_count ?? 3}
                          onChange={e => updateDraft(ch.id, { shorts_count: parseInt(e.target.value) })}
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelClass}>Макс. длина клипа (мин)</label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          value={draft.clip_max_minutes ?? 10}
                          onChange={e => updateDraft(ch.id, { clip_max_minutes: parseInt(e.target.value) })}
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <Button
                      variant={saved === ch.id ? 'secondary' : 'brand'}
                      onClick={() => saveRules(ch.id)}
                      disabled={!!saving}
                      className={saved === ch.id ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20' : ''}
                    >
                      {saving === ch.id ? <Loader2 className="animate-spin" /> : saved === ch.id ? <Check /> : <Save />}
                      {saved === ch.id ? 'Сохранено' : 'Сохранить'}
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* ── PODCASTS ── */}
      {activeSection === 'podcasts' && (
        <div className="space-y-4">
          <Card className="bg-accent/5 border-accent/20 p-4 text-xs text-muted-foreground leading-relaxed">
            Каждое шоу соответствует одному YouTube-каналу. ContentOS отдаёт iTunes-совместимый RSS по адресу
            <code className="mx-1 px-1 py-0.5 rounded bg-background/80 text-foreground font-mono text-[11px]">/podcasts/&lt;slug&gt;/feed.xml</code>
            — скопируй URL и вставь в Mave.digital → оно сам распространит по Яндекс.Музыке, Apple, Spotify, VK Подкасты, Zvuk, Castbox. Cover: квадрат 3000×3000, JPG/PNG, sRGB.
          </Card>

          {podcasts.length === 0 ? (
            <Card className="p-12 flex flex-col items-center justify-center text-center">
              <Mic className="w-10 h-10 text-muted-foreground mb-3" />
              <p className="text-foreground font-medium mb-1">Шоу ещё не созданы</p>
              <p className="text-sm text-muted-foreground">Подключи YouTube-канал — шоу создастся автоматически.</p>
            </Card>
          ) : (
            podcasts.map(show => {
              const rssPath = `/podcasts/${show.slug}/feed.xml`
              return (
                <Card key={show.id} className="p-5 space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <input
                        value={show.title}
                        onChange={e => setPodcasts(prev => prev.map(p => p.id === show.id ? { ...p, title: e.target.value } : p))}
                        onBlur={e => { if (e.target.value !== show.title) updatePodcast(show.id, { title: e.target.value }) }}
                        className="w-full text-lg font-semibold tracking-tight text-foreground bg-transparent focus:outline-none focus:ring-0"
                      />
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-muted-foreground/70 font-mono">/podcasts/{show.slug}</span>
                        {savingPodcastId === show.id && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const url = `${window.location.origin}${rssPath}`
                        navigator.clipboard.writeText(url)
                        setCopiedRssId(show.id)
                        setTimeout(() => setCopiedRssId(null), 2000)
                      }}
                    >
                      {copiedRssId === show.id ? <Check /> : <Copy />}
                      {copiedRssId === show.id ? 'Скопировано' : 'RSS URL'}
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <a href={`/podcasts/${show.slug}`} target="_blank" rel="noopener noreferrer">Открыть</a>
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Slug (в URL)</label>
                      <input
                        defaultValue={show.slug}
                        onBlur={e => { if (e.target.value !== show.slug) updatePodcast(show.id, { slug: e.target.value }) }}
                        className={`${inputClass} font-mono text-[12px]`}
                        placeholder="denis-tsaryuk"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Автор</label>
                      <input
                        defaultValue={show.author ?? ''}
                        onBlur={e => updatePodcast(show.id, { author: e.target.value || null })}
                        className={inputClass}
                        placeholder="Денис Царюк"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Email владельца (для Apple)</label>
                      <input
                        type="email"
                        defaultValue={show.owner_email ?? ''}
                        onBlur={e => updatePodcast(show.id, { owner_email: e.target.value || null })}
                        className={inputClass}
                        placeholder="you@example.com"
                      />
                    </div>
                    <div>
                      <label className={labelClass}>Категория iTunes</label>
                      <input
                        defaultValue={show.category ?? ''}
                        onBlur={e => updatePodcast(show.id, { category: e.target.value || null })}
                        className={inputClass}
                        placeholder="Society & Culture"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelClass}>Обложка (URL, квадрат ≥1400px)</label>
                      <div className="flex items-center gap-3">
                        {show.cover_url && (
                          <img src={show.cover_url} alt="" className="w-14 h-14 rounded-lg object-cover border border-border shrink-0" />
                        )}
                        <input
                          defaultValue={show.cover_url ?? ''}
                          onBlur={e => updatePodcast(show.id, { cover_url: e.target.value || null })}
                          className={inputClass}
                          placeholder="https://…/cover-3000.jpg"
                        />
                      </div>
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelClass}>Описание</label>
                      <textarea
                        defaultValue={show.description ?? ''}
                        onBlur={e => updatePodcast(show.id, { description: e.target.value || null })}
                        className={`${textareaClass} min-h-[80px]`}
                        placeholder="О чём подкаст"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelClass}>Промпт для обложки эпизода (используется в ThumbnailStudio)</label>
                      <textarea
                        defaultValue={show.cover_style_prompt ?? ''}
                        onBlur={e => updatePodcast(show.id, { cover_style_prompt: e.target.value || null })}
                        className={`${textareaClass} min-h-[60px] font-mono text-[12px]`}
                        placeholder="dark green bokeh background, portrait in center, huge white sans-serif surname"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-6 flex-wrap pt-2 border-t border-border">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={show.auto_publish}
                        onChange={e => updatePodcast(show.id, { auto_publish: e.target.checked })}
                        className="h-4 w-4 rounded border-border"
                      />
                      Авто-публикация новых <code className="font-mono text-[11px]">content_type=&#39;podcast&#39;</code>
                    </label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={show.is_active}
                        onChange={e => updatePodcast(show.id, { is_active: e.target.checked })}
                        className="h-4 w-4 rounded border-border"
                      />
                      Шоу активно (виден RSS/лендинг)
                    </label>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer ml-auto">
                      Обрезать начало, сек
                      <input
                        type="number"
                        min={0}
                        defaultValue={show.default_trim_start_sec}
                        onBlur={e => updatePodcast(show.id, { default_trim_start_sec: Math.max(0, parseInt(e.target.value || '0', 10)) })}
                        className="w-16 h-8 px-2 rounded bg-background border border-border text-center text-foreground"
                      />
                    </label>
                  </div>
                </Card>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
