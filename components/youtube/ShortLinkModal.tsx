'use client'

import { useEffect, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { X, Copy, Check, Link as LinkIcon, Loader2 } from 'lucide-react'

interface ShortLinkModalProps {
  videoId: string
  onClose: () => void
}

interface ShortLink {
  slug: string
  url: string
  clicks: number
}

export function ShortLinkModal({ videoId, onClose }: ShortLinkModalProps) {
  const [link, setLink] = useState<ShortLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/youtube/${videoId}/short-link`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? 'Не удалось загрузить')
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        if (data.link) setLink(data.link)
      })
      .catch((e) => !cancelled && setError(String(e.message ?? e)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [videoId])

  async function handleCreate() {
    setCreating(true)
    setError(null)
    try {
      const res = await fetch(`/api/youtube/${videoId}/short-link`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Не удалось создать ссылку')
      setLink(data.link)
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setCreating(false)
    }
  }

  async function handleCopy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('Не удалось скопировать')
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-bg border border-border rounded-2xl w-full max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-dim hover:text-cream hover:bg-white/5 transition-colors"
          aria-label="Закрыть"
        >
          <X className="w-4 h-4" />
        </button>

        <h2 className="text-lg font-semibold text-cream mb-1 flex items-center gap-2">
          <LinkIcon className="w-4 h-4" />
          Deep link
        </h2>
        <p className="text-xs text-dim mb-5">
          Открывает видео в нативном приложении YouTube вместо встроенного
          браузера Instagram / Threads / TikTok.
        </p>

        {loading ? (
          <div className="flex items-center gap-2 text-dim text-sm py-6">
            <Loader2 className="w-4 h-4 animate-spin" />
            Загружаем…
          </div>
        ) : link ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-surface rounded-xl border border-border">
              <code className="flex-1 text-sm text-cream break-all">{link.url}</code>
              <button
                onClick={handleCopy}
                className="shrink-0 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                aria-label="Скопировать"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-center p-4 bg-white rounded-xl">
              <QRCodeSVG value={link.url} size={192} level="M" />
            </div>

            <div className="flex items-center justify-between text-xs text-dim">
              <span>Кликов: {link.clicks}</span>
              <span className="opacity-60">slug: {link.slug}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-dim">
              Для этого видео ссылка ещё не создана.
            </p>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="w-full px-4 py-2.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 font-medium text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
              {creating ? 'Создаём…' : 'Создать deep link'}
            </button>
          </div>
        )}

        {error && (
          <p className="mt-4 text-xs text-red-400">{error}</p>
        )}
      </div>
    </div>
  )
}
