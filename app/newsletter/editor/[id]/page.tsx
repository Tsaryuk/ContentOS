'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Trash2, FileText } from 'lucide-react'
import Link from 'next/link'
import { EditorPanel } from '@/components/newsletter/EditorPanel'
import { AiChat } from '@/components/newsletter/AiChat'
import { toast, toastConfirm } from '@/lib/toast'
import { useUnsavedChanges } from '@/lib/hooks/useUnsavedChanges'
import { pillClass, statusLabel } from '@/lib/status-colors'

interface Issue {
  id: string
  subject: string
  preheader: string
  tag: string
  subtitle: string
  body_html: string
  issue_number: number | null
  status: string
  scheduled_at: string | null
  category: string | null
  tags: string[]
  version: number
  campaign: any
  ai_messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

interface SourceArticle {
  id: string
  title: string
  blog_slug: string | null
  status: string
}

export default function NewsletterEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [issue, setIssue] = useState<Issue | null>(null)
  const [sourceArticle, setSourceArticle] = useState<SourceArticle | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [dirty, setDirty] = useState(false)
  useUnsavedChanges(dirty)

  async function handleDelete() {
    if (deleting) return
    const ok = await toastConfirm(
      'Удалить этот выпуск? Связь со статьёй снимется, статью можно будет пересоздать.',
      { okLabel: 'Удалить', cancelLabel: 'Отмена', destructive: true },
    )
    if (!ok) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/newsletter/issues/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(`Не удалось удалить: ${data.error ?? res.status}`)
        return
      }
      router.push('/newsletter')
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/newsletter/issues/${id}`)
      const data = await res.json()
      if (data.issue) setIssue(data.issue)
      if (data.sourceArticle) setSourceArticle(data.sourceArticle)
      setLoading(false)
    }
    load()
  }, [id])

  function updateLocal(fields: Partial<Issue>) {
    setIssue(prev => prev ? { ...prev, ...fields } : prev)
    // Bumps from a successful save (version/status only) shouldn't flip
    // dirty back on. Everything else is a user-initiated change.
    const onlyServerFields = Object.keys(fields).every(k => k === 'version' || k === 'status')
    if (!onlyServerFields) setDirty(true)
  }

  const handleSave = useCallback(async () => {
    if (!issue || saving) return
    setSaving(true)
    try {
      const res = await fetch(`/api/newsletter/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: issue.subject,
          preheader: issue.preheader,
          tag: issue.tag,
          subtitle: issue.subtitle,
          body_html: issue.body_html,
          issue_number: issue.issue_number,
          category: issue.category,
          tags: issue.tags,
        }),
      })
      const data = await res.json()
      if (data.issue) {
        setIssue(prev => prev ? { ...prev, version: data.issue.version } : prev)
        setDirty(false)
      }
    } finally {
      setSaving(false)
    }
  }, [issue, id, saving])

  async function handleUpload() {
    await handleSave()
    const res = await fetch(`/api/newsletter/issues/${id}/upload`, { method: 'POST' })
    const data = await res.json()
    if (data.error) toast.error(data.error)
    else {
      setIssue(prev => prev ? { ...prev, status: 'uploaded' } : prev)
      toast.success('Загружено в Unisender')
    }
  }

  async function handleSchedule(startTime?: string) {
    const res = await fetch(`/api/newsletter/issues/${id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_time: startTime }),
    })
    const data = await res.json()
    if (data.error) toast.error(data.error)
    else {
      setIssue(prev => prev ? { ...prev, status: 'scheduled' } : prev)
      toast.success(startTime ? `Запланировано на ${startTime}` : 'Отправка запущена')
    }
  }

  function handleInsertText(text: string) {
    if (!issue) return
    const html = text.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '').join('\n')
    updateLocal({ body_html: issue.body_html + '\n' + html })
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-dim" /></div>
  if (!issue) return <div className="flex-1 flex items-center justify-center"><p className="text-muted">Выпуск не найден</p></div>

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Link href="/newsletter" className="p-1.5 text-dim hover:text-muted"><ArrowLeft className="w-4 h-4" /></Link>
        <span className="text-sm font-medium text-cream">
          {issue.issue_number ? `Выпуск #${issue.issue_number}` : 'Письмо'}
        </span>
        <span className={pillClass(issue.status)}>{statusLabel(issue.status)}</span>
        {sourceArticle && (
          <Link
            href={`/articles/${sourceArticle.id}`}
            title={`Источник: статья «${sourceArticle.title}»`}
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent/10 text-accent hover:bg-accent/20 text-[10px] max-w-[280px]"
          >
            <FileText className="w-3 h-3 shrink-0" />
            <span className="truncate">Из статьи: {sourceArticle.title}</span>
          </Link>
        )}
        <div className="flex-1" />
        <button
          onClick={handleDelete}
          disabled={deleting}
          title="Удалить выпуск и снять связь со статьёй"
          className="p-1.5 text-dim hover:text-red-400 hover:bg-red-500/10 rounded disabled:opacity-50"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 border-r border-border">
          <EditorPanel
            issue={issue}
            onUpdate={updateLocal}
            onSave={handleSave}
            onUpload={handleUpload}
            onSchedule={handleSchedule}
            saving={saving}
          />
        </div>
        <div className="w-[380px] shrink-0">
          <AiChat
            issueId={issue.id}
            currentHtml={issue.body_html}
            initialMessages={issue.ai_messages}
            onInsertText={handleInsertText}
            onBodyHtmlReplaced={(html) => updateLocal({ body_html: html })}
          />
        </div>
      </div>
    </div>
  )
}
