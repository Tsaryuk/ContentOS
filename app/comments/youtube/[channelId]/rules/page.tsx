'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Save, Loader2, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'

interface CommentRules {
  enabled: boolean
  auto_reply: boolean
  daily_limit: number
  tone: string
  telegram_url: string
  community_url: string
  cta_frequency: number
  skip_rules: string[]
  max_reply_length: number
  thread_depth: number
}

const DEFAULTS: CommentRules = {
  enabled: false,
  auto_reply: false,
  daily_limit: 3,
  tone: '',
  telegram_url: '',
  community_url: '',
  cta_frequency: 0.3,
  skip_rules: ['spam', 'owner_reply', 'too_short', 'negative_toxic'],
  max_reply_length: 350,
  thread_depth: 1,
}

const SKIP_OPTIONS = [
  { key: 'spam', label: 'Спам и реклама' },
  { key: 'owner_reply', label: 'Свои ответы' },
  { key: 'too_short', label: 'Слишком короткие (<3 слов без вопроса)' },
  { key: 'negative_toxic', label: 'Токсичные / оскорбления' },
] as const

interface ChannelData {
  id: string
  title: string
  rules: Record<string, unknown> | null
}

interface QueueItem {
  id: string
  yt_comment_id: string
  text: string
  author_name: string
  video: { id: string; title: string | null }
}

const inputClass =
  'w-full h-9 px-3 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring'
const textareaClass =
  'w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none'
const labelClass =
  'text-[10px] text-muted-foreground uppercase tracking-wider font-medium'

export default function RulesPage() {
  const params = useParams<{ channelId: string }>()
  const channelId = params.channelId

  const [channel, setChannel] = useState<ChannelData | null>(null)
  const [rules, setRules] = useState<CommentRules>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [queue, setQueue] = useState<QueueItem[]>([])
  const [testCommentId, setTestCommentId] = useState<string>('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [chRes, queueRes] = await Promise.all([
        fetch(`/api/channels/${channelId}`).then((r) => r.json()),
        fetch(`/api/comments/queue?platform=youtube&channelId=${channelId}&limit=20`).then((r) =>
          r.json(),
        ),
      ])
      const ch = chRes as ChannelData
      setChannel(ch)
      const existing = (ch.rules?.comments as Partial<CommentRules> | undefined) ?? {}
      setRules({ ...DEFAULTS, ...existing })
      const qs: QueueItem[] = queueRes.comments ?? []
      setQueue(qs)
      if (qs[0]) setTestCommentId(qs[0].yt_comment_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }, [channelId])

  useEffect(() => {
    load()
  }, [load])

  async function save() {
    if (!channel) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const merged = {
        ...(channel.rules ?? {}),
        comments: rules,
      }
      const res = await fetch(`/api/channels/${channelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: merged }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Ошибка сохранения')
      setSaved(true)
      setChannel({ ...channel, rules: merged })
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  async function runTest() {
    const item = queue.find((q) => q.yt_comment_id === testCommentId)
    if (!item) return
    setTesting(true)
    setTestResult(null)
    setError(null)
    try {
      // Save current rules first so the draft uses what's on screen, not what was last persisted.
      if (channel) {
        const merged = { ...(channel.rules ?? {}), comments: rules }
        await fetch(`/api/channels/${channelId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rules: merged }),
        })
        setChannel({ ...channel, rules: merged })
      }
      const res = await fetch('/api/comments/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commentId: item.yt_comment_id, videoId: item.video.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Ошибка генерации')
      setTestResult(data.draft as string)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации')
    } finally {
      setTesting(false)
    }
  }

  function toggleSkip(key: string) {
    setRules((r) => {
      const has = r.skip_rules.includes(key)
      return { ...r, skip_rules: has ? r.skip_rules.filter((x) => x !== key) : [...r.skip_rules, key] }
    })
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <Link
        href={`/comments/youtube/${channelId}`}
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="w-3 h-3" /> Назад к каналу
      </Link>

      <h1 className="text-xl font-semibold tracking-tight text-foreground mb-1">
        Правила автоответов
      </h1>
      <p className="text-xs text-muted-foreground mb-6">
        {channel?.title ?? 'Канал'} · YouTube
      </p>

      {loading ? (
        <div className="text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
          Загружаем...
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-medium text-foreground">Авто-ответы</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Когда выключено — генерируются только драфты, ничего не отправляется.
                </div>
              </div>
              <button
                onClick={() => setRules((r) => ({ ...r, auto_reply: !r.auto_reply }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${rules.auto_reply ? 'bg-accent' : 'bg-muted'}`}
                aria-pressed={rules.auto_reply}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${rules.auto_reply ? 'translate-x-5' : ''}`}
                />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border">
              <div>
                <label className={labelClass}>Лимит ответов в сутки</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={rules.daily_limit}
                  onChange={(e) => setRules((r) => ({ ...r, daily_limit: Number(e.target.value) }))}
                  className={`mt-1 ${inputClass}`}
                />
              </div>
              <div>
                <label className={labelClass}>Макс длина ответа (символы)</label>
                <input
                  type="number"
                  min={50}
                  max={1000}
                  value={rules.max_reply_length}
                  onChange={(e) =>
                    setRules((r) => ({ ...r, max_reply_length: Number(e.target.value) }))
                  }
                  className={`mt-1 ${inputClass}`}
                />
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <label className={labelClass}>Тон голоса</label>
            <textarea
              value={rules.tone}
              onChange={(e) => setRules((r) => ({ ...r, tone: e.target.value }))}
              rows={6}
              placeholder="Опиши, как ты пишешь. Например: Спокойный, прямой, без лекторства. Я говорю как равный, не как эксперт сверху. Иронии немного, без сарказма. Признаю чужую точку зрения, потом даю свою."
              className={`mt-1.5 ${textareaClass}`}
            />
            <div className="text-[10px] text-muted-foreground mt-1.5">
              Чем конкретнее опишешь — тем ближе к твоему голосу. Пример из 5–10 строк работает лучше, чем «дружелюбный».
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="text-sm font-medium text-foreground mb-1">CTA в Telegram / сообщество</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Telegram URL</label>
                <input
                  type="url"
                  value={rules.telegram_url}
                  onChange={(e) => setRules((r) => ({ ...r, telegram_url: e.target.value }))}
                  placeholder="https://t.me/your_channel"
                  className={`mt-1 ${inputClass}`}
                />
              </div>
              <div>
                <label className={labelClass}>Сообщество URL</label>
                <input
                  type="url"
                  value={rules.community_url}
                  onChange={(e) => setRules((r) => ({ ...r, community_url: e.target.value }))}
                  placeholder="https://..."
                  className={`mt-1 ${inputClass}`}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>
                Частота CTA: {Math.round(rules.cta_frequency * 100)}%
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(rules.cta_frequency * 100)}
                onChange={(e) => setRules((r) => ({ ...r, cta_frequency: Number(e.target.value) / 100 }))}
                className="w-full mt-1.5 accent-accent"
              />
              <div className="text-[10px] text-muted-foreground mt-1">
                Доля ответов, в которых модель пытается мягко вставить CTA. Только когда оно естественно вписывается в контекст.
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="text-sm font-medium text-foreground mb-1">Что пропускаем</div>
            <div className="space-y-2">
              {SKIP_OPTIONS.map((o) => (
                <label key={o.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rules.skip_rules.includes(o.key)}
                    onChange={() => toggleSkip(o.key)}
                    className="w-4 h-4 rounded border-border text-accent focus:ring-2 focus:ring-ring"
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
            <div className="pt-3 border-t border-border">
              <label className={labelClass}>Глубина тредов</label>
              <select
                value={rules.thread_depth}
                onChange={(e) => setRules((r) => ({ ...r, thread_depth: Number(e.target.value) }))}
                className={`mt-1 ${inputClass}`}
              >
                <option value={0}>0 — только верхний уровень</option>
                <option value={1}>1 — плюс ответ зрителя на наш ответ</option>
                <option value={2}>2 — два уровня (рискованно)</option>
              </select>
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <div className="text-sm font-medium text-foreground mb-1">Тест на реальном комментарии</div>
            <div className="text-xs text-muted-foreground">
              Сохранит текущие правила и сгенерирует ответ на выбранный комментарий из очереди — без отправки.
            </div>
            {queue.length === 0 ? (
              <div className="text-xs text-muted-foreground">Очередь пуста — нечего тестировать.</div>
            ) : (
              <>
                <select
                  value={testCommentId}
                  onChange={(e) => setTestCommentId(e.target.value)}
                  className={inputClass}
                >
                  {queue.map((q) => (
                    <option key={q.yt_comment_id} value={q.yt_comment_id}>
                      @{q.author_name}: {q.text.slice(0, 70)}
                      {q.text.length > 70 ? '…' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={runTest}
                  disabled={testing || !testCommentId}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border hover:bg-accent-surface disabled:opacity-50"
                >
                  {testing ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  Сгенерировать
                </button>
                {testResult && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-accent-surface border border-border text-sm text-foreground whitespace-pre-wrap">
                    {testResult}
                  </div>
                )}
              </>
            )}
          </Card>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-accent to-purple shadow-md shadow-accent/20 hover:shadow-lg disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Сохранить
            </button>
            {saved && <span className="text-xs text-emerald-600 dark:text-emerald-300">Сохранено</span>}
          </div>
        </div>
      )}
    </div>
  )
}
