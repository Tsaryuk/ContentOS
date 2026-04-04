'use client'

import { useState } from 'react'
import { Send, Clock, Image, Link, X, Loader2, Sparkles, Eye, Code } from 'lucide-react'
import type { TgChannelRow } from '@/lib/telegram/types'

interface PostEditorProps {
  channels: TgChannelRow[]
  initialChannelId?: string
  initialContent?: string
  initialVideoId?: string
  postId?: string
  onSaved: () => void
  onClose: () => void
}

export function PostEditor({
  channels,
  initialChannelId,
  initialContent,
  initialVideoId,
  postId,
  onSaved,
  onClose,
}: PostEditorProps) {
  const [channelId, setChannelId] = useState(initialChannelId ?? channels[0]?.id ?? '')
  const [content, setContent] = useState(initialContent ?? '')
  const [mediaUrls, setMediaUrls] = useState<string[]>([])
  const [mediaInput, setMediaInput] = useState('')
  const [showMediaInput, setShowMediaInput] = useState(false)
  const [scheduledAt, setScheduledAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(false)

  async function handleSave(schedule: boolean) {
    if (!channelId || !content.trim()) return
    setSaving(true)
    setError('')

    try {
      const url = postId ? `/api/telegram/posts/${postId}` : '/api/telegram/posts'
      const method = postId ? 'PATCH' : 'POST'

      const body: Record<string, unknown> = {
        channel_id: channelId,
        content: content.trim(),
        media_urls: mediaUrls.length > 0 ? mediaUrls : undefined,
        video_id: initialVideoId || undefined,
      }

      if (schedule && scheduledAt) {
        body.scheduled_at = new Date(scheduledAt).toISOString()
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setSaving(false)
    }
  }

  async function handleSendNow() {
    if (!postId) {
      await handleSave(false)
      return
    }
    setSending(true)
    setError('')
    try {
      const res = await fetch(`/api/telegram/posts/${postId}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      onSaved()
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setSending(false)
    }
  }

  async function handleAiGenerate() {
    if (!channelId) return
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/telegram/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_id: channelId,
          video_id: initialVideoId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.content) setContent(data.content)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка')
    } finally {
      setGenerating(false)
    }
  }

  function addMedia() {
    const url = mediaInput.trim()
    if (!url) return
    setMediaUrls(prev => [...prev, url])
    setMediaInput('')
    setShowMediaInput(false)
  }

  // Convert Telegram HTML to safe preview HTML
  function renderPreview(html: string): string {
    return html
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Restore allowed Telegram tags
      .replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/gs, '<strong>$1</strong>')
      .replace(/&lt;i&gt;(.*?)&lt;\/i&gt;/gs, '<em>$1</em>')
      .replace(/&lt;code&gt;(.*?)&lt;\/code&gt;/gs, '<code class="bg-white/10 px-1 rounded text-xs">$1</code>')
      .replace(/&lt;pre&gt;(.*?)&lt;\/pre&gt;/gs, '<pre class="bg-white/10 p-2 rounded text-xs overflow-x-auto">$1</pre>')
      .replace(/&lt;a href=&quot;(.*?)&quot;&gt;(.*?)&lt;\/a&gt;/gs, '<a href="$1" class="text-accent underline" target="_blank" rel="noopener">$2</a>')
      .replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/gs, '<u>$1</u>')
      .replace(/&lt;s&gt;(.*?)&lt;\/s&gt;/gs, '<s>$1</s>')
      // Newlines to <br>
      .replace(/\n/g, '<br/>')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <h3 className="text-base font-semibold text-cream">
          {postId ? 'Редактировать пост' : 'Новый пост'}
        </h3>
        <button onClick={onClose} className="text-dim hover:text-muted transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Channel selector */}
        <div>
          <label className="block text-xs text-muted mb-1.5">Канал</label>
          <select
            value={channelId}
            onChange={e => setChannelId(e.target.value)}
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-cream focus:outline-none focus:border-accent"
          >
            {channels.map(ch => (
              <option key={ch.id} value={ch.id}>
                {ch.title} {ch.username ? `(@${ch.username})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Content with preview toggle */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted">Текст поста</label>
              <button
                onClick={() => setPreview(!preview)}
                className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                  preview ? 'bg-accent/10 text-accent' : 'text-dim hover:text-muted'
                }`}
              >
                {preview ? <Eye className="w-3 h-3" /> : <Code className="w-3 h-3" />}
                {preview ? 'Preview' : 'HTML'}
              </button>
            </div>
            <button
              onClick={handleAiGenerate}
              disabled={generating}
              className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors disabled:opacity-50"
            >
              {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              AI-генерация
            </button>
          </div>

          {preview ? (
            <div
              className="w-full min-h-[200px] px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-cream leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderPreview(content) }}
            />
          ) : (
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Текст поста для Telegram-канала...&#10;&#10;Поддерживается HTML: <b>жирный</b>, <i>курсив</i>, <code>код</code>"
              rows={10}
              className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-cream placeholder:text-dim focus:outline-none focus:border-accent resize-none font-mono text-[13px] leading-relaxed"
            />
          )}
          <div className="text-[10px] text-dim mt-1 text-right">
            {content.length} символов
          </div>
        </div>

        {/* Media */}
        <div>
          <label className="block text-xs text-muted mb-1.5">Медиа</label>
          <div className="space-y-2">
            {mediaUrls.map((url, i) => (
              <div key={i} className="flex items-center gap-2 bg-bg-input rounded-lg p-2 group">
                {/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url) ? (
                  <img src={url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded bg-white/5 flex items-center justify-center shrink-0">
                    <Link className="w-4 h-4 text-dim" />
                  </div>
                )}
                <span className="flex-1 text-xs text-muted truncate">{url}</span>
                <button
                  onClick={() => setMediaUrls(prev => prev.filter((_, idx) => idx !== i))}
                  className="text-dim hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {showMediaInput ? (
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={mediaInput}
                  onChange={e => setMediaInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addMedia()
                    if (e.key === 'Escape') { setShowMediaInput(false); setMediaInput('') }
                  }}
                  placeholder="https://example.com/image.jpg"
                  className="flex-1 px-3 py-2 bg-bg-input border border-border rounded-lg text-xs text-cream placeholder:text-dim focus:outline-none focus:border-accent"
                  autoFocus
                />
                <button
                  onClick={addMedia}
                  disabled={!mediaInput.trim()}
                  className="px-3 py-2 bg-accent text-white text-xs rounded-lg hover:bg-accent/90 disabled:opacity-50"
                >
                  Добавить
                </button>
                <button
                  onClick={() => { setShowMediaInput(false); setMediaInput('') }}
                  className="text-dim hover:text-muted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowMediaInput(true)}
                className="flex items-center gap-1.5 text-xs text-muted hover:text-cream transition-colors py-1"
              >
                <Image className="w-3.5 h-3.5" />
                Добавить изображение или видео
              </button>
            )}
          </div>
        </div>

        {/* Schedule */}
        <div>
          <label className="block text-xs text-muted mb-1.5">
            <Clock className="inline w-3 h-3 mr-1" />
            Запланировать
          </label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={e => setScheduledAt(e.target.value)}
            className="w-full px-3 py-2 bg-bg-input border border-border rounded-lg text-sm text-cream focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-4 border-t border-border flex items-center gap-2">
        <button
          onClick={() => handleSave(false)}
          disabled={saving || !content.trim() || !channelId}
          className="px-4 py-2 border border-border rounded-lg text-sm text-muted hover:text-cream hover:border-muted transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Сохранить черновик
        </button>

        {scheduledAt && (
          <button
            onClick={() => handleSave(true)}
            disabled={saving || !content.trim() || !channelId}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Clock className="w-3.5 h-3.5" />
            Запланировать
          </button>
        )}

        <div className="flex-1" />

        {postId && (
          <button
            onClick={handleSendNow}
            disabled={sending || !content.trim()}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/90 disabled:opacity-50 flex items-center gap-1.5"
          >
            {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            Отправить сейчас
          </button>
        )}
      </div>
    </div>
  )
}
