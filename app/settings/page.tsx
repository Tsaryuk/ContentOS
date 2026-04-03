'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Save, Loader2, Plus, X, ChevronDown, ChevronUp,
  Play, FolderOpen, User, Users, Check, LogOut, Trash2, RotateCcw, Shield,
  Activity, CheckCircle, AlertCircle, XCircle, RefreshCw
} from 'lucide-react'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

interface Project { id: string; name: string; color: string; slug: string }
interface Channel {
  id: string; title: string; handle: string | null
  thumbnail_url: string | null; project_id: string | null
  yt_channel_id: string; google_account_id: string | null
  rules?: ChannelRules
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

function OAuthBanner() {
  const params = useSearchParams()
  const ok = params.get('oauth_ok')
  const email = params.get('email')
  const channels = params.get('channels')
  const err = params.get('oauth_error')
  if (!ok && !err) return null
  return (
    <div className={`mb-6 px-4 py-3 rounded-xl border text-sm flex items-center gap-2 ${
      ok ? 'bg-green/10 border-green/20 text-green' : 'bg-red-500/10 border-red-500/20 text-red-400'
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
  const [accounts, setAccounts] = useState<GoogleAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [activeSection, setActiveSection] = useState<'services' | 'accounts' | 'projects' | 'channels' | 'users'>('services')
  const [sessionRole, setSessionRole] = useState<string | null>(null)

  // Users management
  const [usersList, setUsersList] = useState<{ id: string; email: string; name: string; role: string; is_active: boolean; created_at: string }[]>([])
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState('manager')
  const [creatingUser, setCreatingUser] = useState(false)
  const [userError, setUserError] = useState('')
  const [togglingUser, setTogglingUser] = useState<string | null>(null)

  // Project form
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectColor, setNewProjectColor] = useState('#a67ff0')
  const [creatingProject, setCreatingProject] = useState(false)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [addChannelId, setAddChannelId] = useState('')
  const [addChannelProject, setAddChannelProject] = useState('')
  const [addingChannel, setAddingChannel] = useState(false)
  const [addChannelError, setAddChannelError] = useState('')
  const [deletingChannel, setDeletingChannel] = useState<string | null>(null)
  const [refreshingChannel, setRefreshingChannel] = useState<string | null>(null)

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
      const [projRes, accRes] = await Promise.all([
        fetch('/api/projects'),
        SUPABASE_URL ? fetch(`${SUPABASE_URL}/rest/v1/google_accounts?select=*`, {
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
        }) : Promise.resolve(null),
      ])
      const { projects: p, channels: c } = await projRes.json()
      setProjects(p ?? [])
      setChannels(c ?? [])
      const initial: Record<string, ChannelRules> = {}
      for (const ch of (c ?? [])) initial[ch.id] = { ...DEFAULT_RULES, ...(ch.rules ?? {}) }
      setDrafts(initial)

      if (accRes) {
        const accData = await accRes.json()
        if (Array.isArray(accData)) setAccounts(accData)
      }
    } finally {
      setLoading(false)
    }
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

  async function disconnectAccount(id: string) {
    if (!confirm('Отключить этот Google-аккаунт?')) return
    setDisconnecting(id)
    await fetch(`/api/accounts/${id}`, { method: 'DELETE' })
    setDisconnecting(null)
    await loadData()
  }

  async function addChannelById() {
    const id = addChannelId.trim().replace(/.*channel\//,'').replace(/\/.*/,'')
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

  async function assignToProject(channelId: string, projectId: string | null) {
    await fetch('/api/projects/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId, projectId }),
    })
    setChannels(prev => prev.map(c => c.id === channelId ? { ...c, project_id: projectId } : c))
  }

  function updateDraft(channelId: string, patch: Partial<ChannelRules>) {
    setDrafts(prev => ({ ...prev, [channelId]: { ...prev[channelId], ...patch } }))
  }

  async function saveRules(channelId: string) {
    setSaving(channelId)
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/yt_channels?id=eq.${channelId}`, {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify({ rules: drafts[channelId] }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSaved(channelId)
      setTimeout(() => setSaved(null), 2000)
    } finally { setSaving(null) }
  }

  // Health check
  const [healthServices, setHealthServices] = useState<{ name: string; status: string; detail?: string }[]>([])
  const [healthLoading, setHealthLoading] = useState(false)
  const [healthTimestamp, setHealthTimestamp] = useState<string | null>(null)

  async function loadHealth() {
    setHealthLoading(true)
    try {
      const res = await fetch('/api/health')
      const data = await res.json()
      setHealthServices(data.services ?? [])
      setHealthTimestamp(data.timestamp)
    } catch {
      setHealthServices([])
    } finally {
      setHealthLoading(false)
    }
  }

  const SECTIONS = [
    { id: 'services' as const, label: 'Сервисы', icon: <Activity className="w-4 h-4" /> },
    { id: 'accounts' as const, label: 'Google аккаунты', icon: <User className="w-4 h-4" /> },
    { id: 'projects' as const, label: 'Проекты', icon: <FolderOpen className="w-4 h-4" /> },
    { id: 'channels' as const, label: 'Каналы', icon: <Play className="w-4 h-4" /> },
  ]

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-5 h-5 animate-spin text-muted" />
    </div>
  )

  return (
    <div className="text-cream font-sans">
      {/* Header */}
      <div className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">ContentOS</span>
          <span className="text-dim">/</span>
          <span className="font-medium">Настройки</span>
        </div>
        <a
          href="/api/auth/start"
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors"
        >
          <Play className="w-3.5 h-3.5" />
          Подключить Google аккаунт
        </a>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6">
        <Suspense fallback={null}><OAuthBanner /></Suspense>

        {/* Section tabs */}
        <div className="flex gap-1 mb-6 bg-surface rounded-lg p-1 border border-border w-fit">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeSection === s.id ? 'bg-bg text-cream border border-border shadow-surface' : 'text-muted hover:text-cream'
              }`}
            >
              {s.icon}{s.label}
            </button>
          ))}
        </div>

        {/* ── SERVICES ── */}
        {activeSection === 'services' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted">Статус подключённых сервисов</p>
              <button
                onClick={loadHealth}
                disabled={healthLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted hover:text-cream border border-border hover:bg-surface transition-colors disabled:opacity-50"
              >
                {healthLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Проверить
              </button>
            </div>

            {healthServices.length === 0 && !healthLoading && (
              <div className="py-12 text-center text-muted text-sm">
                <Activity className="w-8 h-8 text-dim mx-auto mb-3" />
                <p>Нажмите «Проверить» чтобы проверить статус сервисов.</p>
              </div>
            )}

            {healthServices.map((svc, i) => (
              <div key={i} className="flex items-center gap-4 bg-surface border border-border rounded-xl px-5 py-4">
                <div className="shrink-0">
                  {svc.status === 'ok' && <CheckCircle className="w-5 h-5 text-emerald-400" />}
                  {svc.status === 'error' && <XCircle className="w-5 h-5 text-red-400" />}
                  {svc.status === 'missing' && <AlertCircle className="w-5 h-5 text-amber-400" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{svc.name}</div>
                  {svc.detail && <div className="text-xs text-muted truncate">{svc.detail}</div>}
                </div>
                <div className="shrink-0">
                  {svc.status === 'ok' && <span className="text-xs text-emerald-400 font-medium">OK</span>}
                  {svc.status === 'error' && <span className="text-xs text-red-400 font-medium">Ошибка</span>}
                  {svc.status === 'missing' && <span className="text-xs text-amber-400 font-medium">Не настроен</span>}
                </div>
              </div>
            ))}

            {healthTimestamp && (
              <p className="text-[10px] text-dim text-right">
                Проверено: {new Date(healthTimestamp).toLocaleString('ru-RU')}
              </p>
            )}
          </div>
        )}

        {/* ── ACCOUNTS ── */}
        {activeSection === 'accounts' && (
          <div className="space-y-3">
            {/* Explanation */}
            <div className="bg-accent/5 border border-accent/20 rounded-xl px-4 py-3 text-xs text-muted leading-relaxed">
              Каждый YouTube-канал (бренд аккаунт) подключается отдельно. Нажмите «Подключить» вверху → выберите нужный аккаунт из списка Google (Денис Царюк, Долг и Деньги, Офлайн Клуб и т.д.) → он появится здесь как отдельная строка.
            </div>

            {accounts.length === 0 ? (
              <div className="py-12 text-center text-muted text-sm">
                <User className="w-8 h-8 text-dim mx-auto mb-3" />
                <p>Нет подключённых аккаунтов.</p>
              </div>
            ) : (
              accounts.map(acc => {
                const accChannels = channels.filter(c => c.google_account_id === acc.id)
                const ch = accChannels[0]
                const isBrand = acc.email?.includes('pages.plusgoogle.com')
                return (
                  <div key={acc.id} className="flex items-center gap-4 bg-surface border border-border rounded-xl px-5 py-4">
                    {/* Show channel thumbnail if available, else Google avatar */}
                    {ch?.thumbnail_url
                      ? <img src={ch.thumbnail_url} className="w-10 h-10 rounded-full" alt="" />
                      : acc.picture
                        ? <img src={acc.picture} className="w-10 h-10 rounded-full" alt="" />
                        : <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm">{acc.name?.[0]}</div>
                    }
                    <div className="flex-1 min-w-0">
                      {/* Show channel name as primary if available */}
                      <div className="text-sm font-medium truncate">
                        {ch?.title ?? acc.name}
                      </div>
                      {/* Show handle if available */}
                      {ch?.handle && (
                        <div className="text-xs text-muted">{ch.handle}</div>
                      )}
                      {/* Show email only if it's not a confusing brand account email */}
                      {!isBrand && (
                        <div className="text-xs text-dim">{acc.email}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-green" />
                        <span className="text-xs text-green">Подключён</span>
                      </div>
                      <button
                        onClick={() => disconnectAccount(acc.id)}
                        disabled={disconnecting === acc.id}
                        className="text-xs text-dim hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-500/10"
                      >
                        {disconnecting === acc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Отключить'}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ── PROJECTS ── */}
        {activeSection === 'projects' && (
          <div className="space-y-4">
            {/* Create project */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="text-xs text-muted font-medium mb-3 uppercase tracking-wider">Новый проект</div>
              <div className="flex gap-2">
                <input
                  value={newProjectColor}
                  onChange={e => setNewProjectColor(e.target.value)}
                  type="color"
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer bg-transparent"
                />
                <input
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createProject()}
                  placeholder="Название проекта..."
                  className="flex-1 px-3 py-2 rounded-lg bg-bg border border-border text-sm text-cream placeholder:text-dim focus:outline-none focus:border-accent/50"
                />
                <button
                  onClick={createProject}
                  disabled={creatingProject || !newProjectName.trim()}
                  className="px-4 py-2 rounded-lg bg-accent hover:opacity-90 disabled:opacity-30 text-white text-sm font-medium flex items-center gap-1.5"
                >
                  {creatingProject ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Создать
                </button>
              </div>
            </div>

            {/* Project list */}
            {projects.map(proj => {
              const projChannels = channels.filter(c => c.project_id === proj.id)
              return (
                <div key={proj.id} className="bg-surface border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-3 flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: proj.color }} />
                    <span className="text-sm font-medium">{proj.name}</span>
                    <span className="text-xs text-dim ml-auto">{projChannels.length} кан.</span>
                    <button
                      onClick={async () => {
                        if (!confirm(`Удалить проект "${proj.name}"? Каналы останутся без проекта.`)) return
                        // Unassign channels first
                        for (const ch of projChannels) {
                          await assignToProject(ch.id, null)
                        }
                        await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${proj.id}`, {
                          method: 'DELETE',
                          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
                        })
                        await loadData()
                      }}
                      className="text-dim hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {projChannels.length > 0 && (
                    <div className="border-t border-border px-5 py-2 space-y-1.5">
                      {projChannels.map(ch => (
                        <div key={ch.id} className="flex items-center gap-2 py-1">
                          {ch.thumbnail_url
                            ? <img src={ch.thumbnail_url} className="w-6 h-6 rounded-full" alt="" />
                            : <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-[9px] text-red-400 font-bold">YT</div>
                          }
                          <span className="text-xs text-cream flex-1 truncate">{ch.title}</span>
                          <span className="text-[10px] text-dim">{ch.handle}</span>
                          <button
                            onClick={() => assignToProject(ch.id, null)}
                            title="Убрать из проекта"
                            className="text-dim hover:text-red-400 transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Unassigned channels */}
            {channels.filter(c => !c.project_id).length > 0 && (
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full shrink-0 bg-dim/30" />
                  <span className="text-sm font-medium text-dim">Без проекта</span>
                  <span className="text-xs text-dim ml-auto">{channels.filter(c => !c.project_id).length} кан.</span>
                </div>
                <div className="border-t border-border px-5 py-2 space-y-1.5">
                  {channels.filter(c => !c.project_id).map(ch => (
                    <div key={ch.id} className="flex items-center gap-2 py-1">
                      {ch.thumbnail_url
                        ? <img src={ch.thumbnail_url} className="w-6 h-6 rounded-full" alt="" />
                        : <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-[9px] text-red-400 font-bold">YT</div>
                      }
                      <span className="text-xs text-cream flex-1 truncate">{ch.title}</span>
                      <select
                        onChange={e => { if (e.target.value) assignToProject(ch.id, e.target.value) }}
                        className="text-[10px] bg-bg border border-border rounded px-1.5 py-1 text-cream"
                        defaultValue=""
                      >
                        <option value="">Добавить в...</option>
                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── CHANNELS ── */}
        {activeSection === 'channels' && (
          <div className="space-y-3">
            {/* Add channel by ID */}
            <div className="bg-surface border border-border rounded-xl p-4">
              <div className="text-xs text-muted font-medium mb-3 uppercase tracking-wider">Добавить канал по ID</div>
              <div className="flex gap-2 mb-2">
                <input
                  value={addChannelId}
                  onChange={e => setAddChannelId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addChannelById()}
                  placeholder="UCaaZTPOISLwBKogX2iBmetQ или ссылка на канал"
                  className="flex-1 px-3 py-2 rounded-lg bg-bg border border-border text-sm text-cream placeholder:text-dim focus:outline-none focus:border-accent/50"
                />
                <select
                  value={addChannelProject}
                  onChange={e => setAddChannelProject(e.target.value)}
                  className="px-2 py-2 rounded-lg bg-bg border border-border text-xs text-cream focus:outline-none max-w-[130px]"
                >
                  <option value="">— проект —</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button
                  onClick={addChannelById}
                  disabled={addingChannel || !addChannelId.trim()}
                  className="px-4 py-2 rounded-lg bg-accent hover:opacity-90 disabled:opacity-30 text-white text-sm font-medium flex items-center gap-1.5"
                >
                  {addingChannel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Добавить
                </button>
              </div>
              {addChannelError && <div className="text-xs text-red-400">{addChannelError}</div>}
            </div>

            {channels.length === 0 && (
              <div className="py-8 text-center text-muted text-sm">
                Нет каналов. Подключите Google-аккаунт или добавьте канал по ID выше.
              </div>
            )}
            {channels.map(ch => {
              const draft = drafts[ch.id] ?? DEFAULT_RULES
              const isExpanded = expandedChannel === ch.id

              return (
                <div key={ch.id} className="bg-surface border border-border rounded-xl overflow-hidden">
                  {/* Channel header */}
                  <div className="px-5 py-3 flex items-center gap-3">
                    {ch.thumbnail_url
                      ? <img src={ch.thumbnail_url} className="w-8 h-8 rounded-full" alt="" />
                      : <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-xs text-red-400 font-bold">YT</div>
                    }
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{ch.title}</div>
                      <div className="text-xs text-dim">{ch.handle}</div>
                    </div>

                    {/* Project selector */}
                    <select
                      value={ch.project_id ?? ''}
                      onChange={e => assignToProject(ch.id, e.target.value || null)}
                      className="text-xs bg-bg border border-border rounded-lg px-2 py-1.5 text-cream focus:outline-none focus:border-accent/50 max-w-[140px]"
                    >
                      <option value="">— без проекта —</option>
                      {projects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>

                    <button
                      onClick={() => refreshChannel(ch.id)}
                      disabled={refreshingChannel === ch.id}
                      title="Обновить название и аватар с YouTube"
                      className="text-dim hover:text-accent transition-colors ml-1"
                    >
                      {refreshingChannel === ch.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <RotateCcw className="w-4 h-4" />}
                    </button>

                    <button
                      onClick={() => deleteChannel(ch.id)}
                      disabled={deletingChannel === ch.id}
                      className="text-dim hover:text-red-400 transition-colors ml-1"
                    >
                      {deletingChannel === ch.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <Trash2 className="w-4 h-4" />}
                    </button>

                    <button
                      onClick={() => setExpandedChannel(isExpanded ? null : ch.id)}
                      className="text-dim hover:text-muted transition-colors ml-1"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Channel rules */}
                  {isExpanded && (
                    <div className="border-t border-border px-5 pb-5 pt-4 space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] text-dim uppercase tracking-wider font-medium">Формат заголовка</label>
                        <input
                          value={draft.title_format ?? ''}
                          onChange={e => updateDraft(ch.id, { title_format: e.target.value })}
                          placeholder="например: {title} | Подкаст"
                          className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-cream placeholder:text-dim focus:outline-none focus:border-accent/40"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-dim uppercase tracking-wider font-medium">Шаблон описания</label>
                        <textarea
                          value={draft.description_template ?? ''}
                          onChange={e => updateDraft(ch.id, { description_template: e.target.value })}
                          rows={3}
                          placeholder="Шаблон описания видео..."
                          className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-cream placeholder:text-dim focus:outline-none focus:border-accent/40 resize-none"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-dim uppercase tracking-wider font-medium">Постоянные ссылки</label>
                        {(draft.required_links ?? []).map((link, i) => (
                          <div key={i} className="flex gap-2">
                            <input
                              value={link}
                              onChange={e => {
                                const links = [...draft.required_links]
                                links[i] = e.target.value
                                updateDraft(ch.id, { required_links: links })
                              }}
                              placeholder="https://..."
                              className="flex-1 px-3 py-2 rounded-lg bg-bg border border-border text-sm text-cream placeholder:text-dim focus:outline-none focus:border-accent/40"
                            />
                            <button onClick={() => updateDraft(ch.id, { required_links: draft.required_links.filter((_, j) => j !== i) })}
                              className="text-dim hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
                          </div>
                        ))}
                        <button
                          onClick={() => updateDraft(ch.id, { required_links: [...(draft.required_links ?? []), ''] })}
                          className="flex items-center gap-1.5 text-xs text-dim hover:text-muted transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" /> Добавить ссылку
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-dim uppercase tracking-wider font-medium">Фиксированные ссылки канала</label>
                        <textarea
                          rows={4}
                          value={draft.channel_links ?? ''}
                          onChange={e => updateDraft(ch.id, { channel_links: e.target.value })}
                          placeholder={'▶︎ конспекты подкастов — https://t.me/...\n▶︎ Instagram — https://instagram.com/...\nРеклама: hi@example.com'}
                          className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-cream placeholder:text-dim focus:outline-none focus:border-accent/40 resize-none font-mono text-xs"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] text-dim uppercase tracking-wider font-medium">Стиль обложки (промпт)</label>
                        <textarea
                          rows={2}
                          value={draft.thumbnail_style_prompt ?? ''}
                          onChange={e => updateDraft(ch.id, { thumbnail_style_prompt: e.target.value })}
                          placeholder="например: тёмный фон с зелёным свечением, крупные лица..."
                          className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-cream placeholder:text-dim focus:outline-none focus:border-accent/40 resize-none"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-dim uppercase tracking-wider font-medium">Shorts в день</label>
                          <input type="number" min={0} max={10} value={draft.shorts_count ?? 3}
                            onChange={e => updateDraft(ch.id, { shorts_count: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-cream focus:outline-none focus:border-accent/40"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] text-dim uppercase tracking-wider font-medium">Макс. длина клипа (мин)</label>
                          <input type="number" min={1} max={60} value={draft.clip_max_minutes ?? 10}
                            onChange={e => updateDraft(ch.id, { clip_max_minutes: parseInt(e.target.value) })}
                            className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm text-cream focus:outline-none focus:border-accent/40"
                          />
                        </div>
                      </div>

                      <button
                        onClick={() => saveRules(ch.id)}
                        disabled={!!saving}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          saved === ch.id ? 'bg-green/20 text-green' : 'bg-accent text-white hover:opacity-90 disabled:opacity-30'
                        }`}
                      >
                        {saving === ch.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        {saved === ch.id ? 'Сохранено' : 'Сохранить'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
