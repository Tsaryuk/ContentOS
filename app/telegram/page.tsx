'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Send, Loader2, RefreshCw } from 'lucide-react'
import type { TgChannelRow, TgPostWithChannel } from '@/lib/telegram/types'
import { ConnectChannel } from '@/components/telegram/ConnectChannel'
import { PostEditor } from '@/components/telegram/PostEditor'
import { PostCard } from '@/components/telegram/PostCard'
import { AiSuggestions } from '@/components/telegram/AiSuggestions'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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
      <div className="flex-1 flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <header className="px-6 md:px-10 pt-6 md:pt-10 pb-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2 uppercase tracking-wider">
            <span>ContentOS</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="normal-case tracking-normal">Социальные сети</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight">Telegram</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {channels.length === 0
              ? 'Подключи канал, чтобы начать постить'
              : `${channels.length} ${channels.length === 1 ? 'канал' : channels.length < 5 ? 'канала' : 'каналов'} · ${posts.length} ${posts.length === 1 ? 'пост' : 'постов'}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => { fetchChannels(); fetchPosts() }}
            title="Обновить"
          >
            <RefreshCw />
          </Button>
          <Button variant="outline" onClick={() => setShowConnect(true)}>
            <Plus />
            Подключить аккаунт
          </Button>
          <Button variant="brand" onClick={handleNewPost} disabled={channels.length === 0}>
            <Send />
            Новый пост
          </Button>
        </div>
      </header>

      {/* Tabs + filters */}
      <div className="px-6 md:px-10 pb-4 flex items-center gap-4 flex-wrap">
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-card border border-border">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              data-active={tab === t.key || undefined}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors text-muted-foreground hover:text-foreground data-[active]:bg-muted data-[active]:text-foreground"
            >
              {t.label}
            </button>
          ))}
        </div>

        {channels.length > 1 && (
          <select
            value={selectedChannel}
            onChange={e => setSelectedChannel(e.target.value)}
            className="ml-auto h-9 px-3 rounded-lg bg-card border border-border text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
      <div className="flex-1 overflow-y-auto px-6 md:px-10 pb-10">
        {channels.length === 0 ? (
          <Card className="p-12 flex flex-col items-center justify-center text-center">
            <Send className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-foreground font-medium mb-1">Нет подключённых каналов</p>
            <p className="text-sm text-muted-foreground mb-6">Подключи Telegram-аккаунт, чтобы начать постить</p>
            <Button variant="brand" onClick={() => setShowConnect(true)}>
              <Plus />
              Подключить Telegram
            </Button>
          </Card>
        ) : posts.length === 0 ? (
          <Card className="p-12 flex flex-col items-center justify-center text-center">
            <Send className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-foreground font-medium mb-1">Нет постов</p>
            <p className="text-sm text-muted-foreground mb-6">Создай первый пост для канала</p>
            <Button variant="brand" onClick={handleNewPost}>
              <Plus />
              Создать пост
            </Button>
          </Card>
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
        <div className="fixed inset-y-0 right-0 w-[480px] bg-card border-l border-border z-40 shadow-2xl">
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
