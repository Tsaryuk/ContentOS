'use client'

import { Send, Clock, AlertCircle, CheckCircle, FileEdit, Trash2 } from 'lucide-react'
import type { TgPostWithChannel } from '@/lib/telegram/types'

interface PostCardProps {
  post: TgPostWithChannel
  onEdit: (post: TgPostWithChannel) => void
  onSend: (postId: string) => void
  onDelete: (postId: string) => void
}

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  draft: { label: 'Черновик', icon: <FileEdit className="w-3 h-3" />, color: 'text-dim bg-white/5' },
  scheduled: { label: 'Запланирован', icon: <Clock className="w-3 h-3" />, color: 'text-blue-400 bg-blue-500/10' },
  sending: { label: 'Отправляется', icon: <Send className="w-3 h-3 animate-pulse" />, color: 'text-yellow-400 bg-yellow-500/10' },
  sent: { label: 'Отправлен', icon: <CheckCircle className="w-3 h-3" />, color: 'text-green-400 bg-green-500/10' },
  failed: { label: 'Ошибка', icon: <AlertCircle className="w-3 h-3" />, color: 'text-red-400 bg-red-500/10' },
}

export function PostCard({ post, onEdit, onSend, onDelete }: PostCardProps) {
  const status = STATUS_CONFIG[post.status] ?? STATUS_CONFIG.draft

  function formatDate(dateStr: string | null) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="bg-bg-card border border-border rounded-xl p-4 hover:border-border-hover transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${status.color}`}>
            {status.icon}
            {status.label}
          </span>
          {post.channel && (
            <span className="text-[10px] text-dim">
              {post.channel.username ? `@${post.channel.username}` : post.channel.title}
            </span>
          )}
        </div>
        <span className="text-[10px] text-dim">
          {post.scheduled_at ? `${formatDate(post.scheduled_at)}` : formatDate(post.created_at)}
        </span>
      </div>

      {/* Content preview */}
      <p className="text-sm text-muted leading-relaxed line-clamp-4 whitespace-pre-wrap mb-3">
        {post.content}
      </p>

      {/* Media preview */}
      {post.media_urls && post.media_urls.length > 0 && (
        <div className="flex gap-1 mb-3">
          {post.media_urls.map((url, i) => (
            <div key={i} className="w-12 h-12 rounded bg-white/5 flex items-center justify-center">
              <img src={url} alt="" className="w-full h-full object-cover rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {post.error && (
        <div className="text-xs text-red-400 bg-red-500/5 rounded p-2 mb-3">
          {post.error}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-border/50">
        {(post.status === 'draft' || post.status === 'failed') && (
          <>
            <button
              onClick={() => onEdit(post)}
              className="text-xs text-muted hover:text-cream transition-colors flex items-center gap-1"
            >
              <FileEdit className="w-3 h-3" />
              Редактировать
            </button>
            <button
              onClick={() => onSend(post.id)}
              className="text-xs text-accent hover:text-accent/80 transition-colors flex items-center gap-1"
            >
              <Send className="w-3 h-3" />
              Отправить
            </button>
          </>
        )}
        {post.status === 'scheduled' && (
          <button
            onClick={() => onEdit(post)}
            className="text-xs text-muted hover:text-cream transition-colors flex items-center gap-1"
          >
            <FileEdit className="w-3 h-3" />
            Изменить
          </button>
        )}
        {post.status !== 'sent' && post.status !== 'sending' && (
          <button
            onClick={() => onDelete(post.id)}
            className="text-xs text-dim hover:text-red-400 transition-colors flex items-center gap-1 ml-auto"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
        {post.sent_at && (
          <span className="text-[10px] text-dim ml-auto">
            Отправлен {formatDate(post.sent_at)}
          </span>
        )}
      </div>
    </div>
  )
}
