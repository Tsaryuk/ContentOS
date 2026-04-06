'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Send, Loader2, RefreshCw } from 'lucide-react'
import type { TgChannelRow, TgPostWithChannel, TgPostStatus } from '@/lib/telegram/types'
import { ConnectChannel } from '@/components/telegram/ConnectChannel'
import { PostEditor } from '@/components/telegram/PostEditor'
import { PostCard } from '@/components/telegram/PostCard'
import { AiSuggestions } from '@/components/telegram/AiSuggestions'

type Tab = 'all' | 'draft' | 'scheduled' | 'sent' | 'failed'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'Все' },
  { key: 'draft', label: 'Черновики' },
  { key: 'scheduled', label: 'Запланированные' },
  { key: 'sent', label: 'Отправленные' },
  { key: 'failed', label: 'Ошибки' },
]

interface ProjectInfo { id: string; name: string; color: string }

export default function TelegramPage() {
  const [channels, setChannels] = useState<TgChannelRow[]>([])
  const [projects, setProjects] = useState<ProjectInfo[]>([])
  const [posts, setPosts] = useState<TgPostWithChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('all')
  const [selectedChannel, setSelectedChannel] = useState<string>('')
  const [showConnect, setShowConnect] = useState(false)
  const [showEditor, setShowEditor] = useState(false)
  const [editingPost, setEditingPost] = useState<TgPostWithChannel | null>(null)

  const fetchChannels = useCallback(async () => {
    const res = await fetch('/api/telegram/channels')
    const data = await res.json()
    if (data.channels) setChannels(data.channels)
  }, [])

  const fetchPosts = useCallback(async () => {
    const params = new URLSearchParams()
    if (tab !== 'all') params.set('status', tab)
    if (selectedChannel) params.set('channel_id', selectedChannel)

    const res = await fetch(`/api/telegram/posts?${params}`)
    const data = await res.json()
    if (data.posts) setPosts(data.posts)
  }, [tab, selectedChannel])

  const fetchProjects = useCallback(async () => {
    const res = await fetch('/api/projects')
    const data = await res.json()
    if (data.projects) setProjects(data.projects)
  }, [])

  useEffect(() => {
    async function init() {
      await Promise.all([fetchChannels(), fetchProjects()])
      await fetchPosts()
      setLoading(false)
    }
    init()
  }, [fetchChannels, fetchProjects, fetchPosts])

  useEffect(() => {
    fetchPosts()
  }, [tab, selectedChannel, fetchPosts])

  async function handleSendPost(postId: string) {
    const res = await fetch(`/api/telegram/posts/${postId}/send`, { method: 'POST' })
    if (res.ok) fetchPosts()
  }

  async function handleDeletePost(postId: string) {
    if (!confirm('Удалить пост?')) return
    const res = await fetch(`/api/telegram/posts/${postId}`, { method: 'DELETE' })
    if (res.ok) fetchPosts()
  }

  function handleEditPost(post: TgPostWithChannel) {
    setEditingPost(post)
    setShowEditor(true)
  }

  function handleNewPost() {
    setEditingPost(null)
    setShowEditor(true)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-dim" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Send className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-semibold text-cream">Telegram</h1>
          <span className="text-xs text-dim px-2 py-0.5 bg-white/5 rounded-full">
            {channels.length} {channels.length === 1 ? 'канал' : 'каналов'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { fetchChannels(); fetchPosts() }}
            className="p-2 text-dim hover:text-muted transition-colors"
            title="Обновить"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowConnect(true)}
            className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream hover:border-muted transition-colors"
          >
            + Подключить аккаунт
          </button>
          <button
            onClick={handleNewPost}
            disabled={channels.length === 0}
            className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs hover:bg-accent/90 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Новый пост
          </button>
        </div>
      </div>

      {/* Tabs + filters */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-border/50">
        <div className="flex gap-1">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === t.key
                  ? 'bg-accent/10 text-accent'
                  : 'text-dim hover:text-muted'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {channels.length > 1 && (
          <select
            value={selectedChannel}
            onChange={e => setSelectedChannel(e.target.value)}
            className="ml-auto px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-muted focus:outline-none focus:border-accent"
          >
            <option value="">Все каналы</option>
            {projects.map(proj => {
              const projChannels = channels.filter(c => c.project_id === proj.id)
              if (projChannels.length === 0) return null
              return (
                <optgroup key={proj.id} label={proj.name}>
                  {projChannels.map(ch => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title} {ch.username ? `(@${ch.username})` : ''}
                    </option>
                  ))}
                </optgroup>
              )
            })}
            {(() => {
              const noProject = channels.filter(c => !c.project_id)
              if (noProject.length === 0) return null
              return (
                <optgroup label="Без проекта">
                  {noProject.map(ch => (
                    <option key={ch.id} value={ch.id}>
                      {ch.title} {ch.username ? `(@${ch.username})` : ''}
                    </option>
                  ))}
                </optgroup>
              )
            })()}
          </select>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Send className="w-10 h-10 text-dim mb-3" />
            <p className="text-muted mb-1">Нет подключённых каналов</p>
            <p className="text-xs text-dim mb-4">
              Подключите Telegram-аккаунт, чтобы начать постить
            </p>
            <button
              onClick={() => setShowConnect(true)}
              className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90"
            >
              Подключить Telegram
            </button>
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <p className="text-muted mb-1">Нет постов</p>
            <p className="text-xs text-dim mb-4">
              Создайте первый пост для вашего канала
            </p>
            <button
              onClick={handleNewPost}
              className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Создать пост
            </button>
          </div>
        ) : (
          <div className="flex gap-6">
            <div className="flex-1 grid gap-3 max-w-3xl">
              {posts.map(post => (
                <PostCard
                  key={post.id}
                  post={post}
                  onEdit={handleEditPost}
                  onSend={handleSendPost}
                  onDelete={handleDeletePost}
                />
              ))}
            </div>
            {channels.length > 0 && (
              <div className="w-80 shrink-0">
                <AiSuggestions channelId={selectedChannel || channels[0]?.id} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Connect modal */}
      {showConnect && (
        <ConnectChannel
          onConnected={fetchChannels}
          onClose={() => setShowConnect(false)}
        />
      )}

      {/* Editor drawer */}
      {showEditor && (
        <div className="fixed inset-y-0 right-0 w-[480px] bg-bg-sidebar border-l border-border z-40 shadow-2xl">
          <PostEditor
            channels={channels}
            initialChannelId={editingPost?.channel_id}
            initialContent={editingPost?.content}
            initialVideoId={editingPost?.video_id ?? undefined}
            postId={editingPost?.id}
            onSaved={fetchPosts}
            onClose={() => { setShowEditor(false); setEditingPost(null) }}
          />
        </div>
      )}
    </div>
  )
}
