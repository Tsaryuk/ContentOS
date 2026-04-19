'use client'

import { useState, useEffect } from 'react'
import { MessageSquare, RefreshCw, Loader2, Wand2, Send, ThumbsUp, Check } from 'lucide-react'

interface Comment {
  id: string
  yt_comment_id: string
  author_name: string
  author_avatar: string | null
  text: string
  like_count: number
  reply_count: number
  published_at: string
  is_owner_reply: boolean
  status: string
  ai_reply_draft: string | null
}

interface Props {
  videoId: string
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} мин`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} ч`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} дн`
  return `${Math.floor(days / 30)} мес`
}

export function CommentsList({ videoId }: Props) {
  const [comments, setComments] = useState<Comment[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [drafting, setDrafting] = useState<string | null>(null)

  async function loadComments() {
    setLoading(true)
    try {
      const res = await fetch(`/api/comments?videoId=${videoId}&limit=20`)
      const data = await res.json()
      setComments(data.comments ?? [])
    } catch {}
    setLoading(false)
  }

  async function syncComments() {
    setSyncing(true)
    try {
      await fetch('/api/comments/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId }),
      })
      await loadComments()
    } catch {}
    setSyncing(false)
  }

  async function generateDraft(commentId: string) {
    setDrafting(commentId)
    try {
      const res = await fetch('/api/comments/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId, videoId }),
      })
      const data = await res.json()
      if (data.draft) {
        setReplyingTo(commentId)
        setReplyText(data.draft)
        setComments(prev => prev.map(c =>
          c.yt_comment_id === commentId ? { ...c, ai_reply_draft: data.draft } : c
        ))
      }
    } catch {}
    setDrafting(null)
  }

  async function sendReply(commentId: string) {
    if (!replyText.trim()) return
    setSending(true)
    try {
      await fetch('/api/comments/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId, text: replyText, videoId }),
      })
      setReplyingTo(null)
      setReplyText('')
      setComments(prev => prev.map(c =>
        c.yt_comment_id === commentId ? { ...c, status: 'replied' } : c
      ))
    } catch {}
    setSending(false)
  }

  useEffect(() => { loadComments() }, [videoId])

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> Комментарии ({comments.length})
        </h3>
        <button
          onClick={syncComments}
          disabled={syncing}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-card transition-colors border border-border"
        >
          {syncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Загрузить
        </button>
      </div>

      {loading && comments.length === 0 ? (
        <div className="py-4 text-center text-muted-foreground/60 text-xs">
          <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" />
          Загрузка...
        </div>
      ) : comments.length === 0 ? (
        <div className="py-4 text-center text-muted-foreground/60 text-xs">
          Нет комментариев. Нажмите "Загрузить" чтобы синхронизировать с YouTube.
        </div>
      ) : (
        <div className="space-y-2">
          {comments.map(c => (
            <div key={c.id} className="rounded-lg border border-border p-3">
              <div className="flex items-start gap-2.5">
                {c.author_avatar ? (
                  <img src={c.author_avatar} className="w-7 h-7 rounded-full shrink-0" alt="" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-accent/20 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-foreground">{c.author_name}</span>
                    <span className="text-[10px] text-muted-foreground/60">{timeAgo(c.published_at)}</span>
                    {c.like_count > 0 && (
                      <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
                        <ThumbsUp className="w-2.5 h-2.5" /> {c.like_count}
                      </span>
                    )}
                    {c.status === 'replied' && (
                      <span className="text-[10px] text-green flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" /> Ответ
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{c.text}</p>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => generateDraft(c.yt_comment_id)}
                      disabled={drafting === c.yt_comment_id}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-purple-400 transition-colors"
                    >
                      {drafting === c.yt_comment_id
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : <Wand2 className="w-3 h-3" />}
                      AI ответ
                    </button>
                    <button
                      onClick={() => {
                        setReplyingTo(replyingTo === c.yt_comment_id ? null : c.yt_comment_id)
                        setReplyText(c.ai_reply_draft ?? '')
                      }}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-accent transition-colors"
                    >
                      <Send className="w-3 h-3" /> Ответить
                    </button>
                  </div>

                  {/* Reply input */}
                  {replyingTo === c.yt_comment_id && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        rows={2}
                        placeholder="Ваш ответ..."
                        className="w-full bg-background border border-border rounded-lg p-2 text-xs text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:border-accent/40"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => sendReply(c.yt_comment_id)}
                          disabled={sending || !replyText.trim()}
                          className="px-3 py-1 rounded-lg bg-accent text-white text-[10px] font-medium hover:opacity-90 disabled:opacity-30 flex items-center gap-1"
                        >
                          {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          Отправить
                        </button>
                        <button
                          onClick={() => { setReplyingTo(null); setReplyText('') }}
                          className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground"
                        >
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
