'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { EditorPanel } from '@/components/newsletter/EditorPanel'
import { AiChat } from '@/components/newsletter/AiChat'

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

export default function NewsletterEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [issue, setIssue] = useState<Issue | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/newsletter/issues/${id}`)
      const data = await res.json()
      if (data.issue) setIssue(data.issue)
      setLoading(false)
    }
    load()
  }, [id])

  function updateLocal(fields: Partial<Issue>) {
    setIssue(prev => prev ? { ...prev, ...fields } : prev)
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
      if (data.issue) setIssue(prev => prev ? { ...prev, version: data.issue.version } : prev)
    } finally {
      setSaving(false)
    }
  }, [issue, id, saving])

  async function handleUpload() {
    await handleSave()
    const res = await fetch(`/api/newsletter/issues/${id}/upload`, { method: 'POST' })
    const data = await res.json()
    if (data.error) alert(data.error)
    else setIssue(prev => prev ? { ...prev, status: 'uploaded' } : prev)
  }

  async function handleSchedule(startTime?: string) {
    const res = await fetch(`/api/newsletter/issues/${id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_time: startTime }),
    })
    const data = await res.json()
    if (data.error) alert(data.error)
    else setIssue(prev => prev ? { ...prev, status: 'scheduled' } : prev)
  }

  function handleInsertText(text: string) {
    if (!issue) return
    const html = text.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '').join('\n')
    updateLocal({ body_html: issue.body_html + '\n' + html })
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-dim" /></div>
  if (!issue) return <div className="flex-1 flex items-center justify-center"><p className="text-muted">Выпуск не найден</p></div>

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Link href="/newsletter" className="p-1.5 text-dim hover:text-muted"><ArrowLeft className="w-4 h-4" /></Link>
        <span className="text-sm font-medium text-cream">
          {issue.issue_number ? `Выпуск #${issue.issue_number}` : 'Письмо'}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
          issue.status === 'draft' ? 'bg-white/5 text-dim' :
          issue.status === 'uploaded' ? 'bg-blue-500/10 text-blue-400' :
          issue.status === 'scheduled' ? 'bg-yellow-500/10 text-yellow-400' :
          'bg-green-500/10 text-green-400'
        }`}>
          {issue.status === 'draft' ? 'Черновик' :
           issue.status === 'uploaded' ? 'Загружено' :
           issue.status === 'scheduled' ? 'Запланировано' : 'Отправлено'}
        </span>
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
          />
        </div>
      </div>
    </div>
  )
}
