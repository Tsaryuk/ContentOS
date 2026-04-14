'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, Loader2, Mail, FileText, Globe } from 'lucide-react'
import Link from 'next/link'
import { EditorPanel } from '@/components/newsletter/EditorPanel'
import { ArticlePanel } from '@/components/newsletter/ArticlePanel'
import { SeoPanel } from '@/components/newsletter/SeoPanel'
import { AiChat } from '@/components/newsletter/AiChat'

type Tab = 'letter' | 'article' | 'seo'

interface Issue {
  id: string
  subject: string
  preheader: string
  tag: string
  subtitle: string
  body_html: string
  body_json: any
  article_html: string
  cover_url: string
  youtube_url: string
  issue_number: number | null
  status: string
  scheduled_at: string | null
  category: string | null
  tags: string[]
  blog_slug: string
  seo_title: string
  seo_description: string
  seo_keywords: string[]
  og_image_url: string
  version: number
  campaign: any
  ai_messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

export default function NewsletterEditorPage() {
  const { id } = useParams<{ id: string }>()
  const [issue, setIssue] = useState<Issue | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<Tab>('letter')

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
          article_html: issue.article_html,
          cover_url: issue.cover_url,
          youtube_url: issue.youtube_url,
          issue_number: issue.issue_number,
          category: issue.category,
          tags: issue.tags,
          blog_slug: issue.blog_slug,
          seo_title: issue.seo_title,
          seo_description: issue.seo_description,
          seo_keywords: issue.seo_keywords,
          og_image_url: issue.og_image_url,
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
    if (data.error) {
      alert(data.error)
    } else {
      setIssue(prev => prev ? { ...prev, status: 'uploaded' } : prev)
    }
  }

  async function handleSchedule(startTime?: string) {
    const res = await fetch(`/api/newsletter/issues/${id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start_time: startTime }),
    })
    const data = await res.json()
    if (data.error) {
      alert(data.error)
    } else {
      setIssue(prev => prev ? { ...prev, status: 'scheduled' } : prev)
    }
  }

  function handleInsertText(text: string) {
    if (!issue) return
    const html = text.split('\n').map(line => line.trim() ? `<p>${line}</p>` : '').join('\n')
    if (tab === 'article') {
      updateLocal({ article_html: issue.article_html + '\n' + html })
    } else {
      updateLocal({ body_html: issue.body_html + '\n' + html })
    }
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-dim" />
      </div>
    )
  }

  if (!issue) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted">Выпуск не найден</p>
      </div>
    )
  }

  const TABS: { key: Tab; label: string; icon: typeof Mail }[] = [
    { key: 'letter', label: 'Письмо', icon: Mail },
    { key: 'article', label: 'Статья', icon: FileText },
    { key: 'seo', label: 'SEO', icon: Globe },
  ]

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Link href="/newsletter" className="p-1.5 text-dim hover:text-muted">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <span className="text-sm font-medium text-cream">
          {issue.issue_number ? `Выпуск #${issue.issue_number}` : 'Новый выпуск'}
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

        {/* Tab switcher */}
        <div className="flex gap-1 ml-4">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  tab === t.key
                    ? 'bg-accent/10 text-accent'
                    : 'text-dim hover:text-muted'
                }`}
              >
                <Icon className="w-3 h-3" />
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Split: content + AI chat */}
      <div className="flex-1 flex min-h-0">
        <div className="flex-1 min-w-0 border-r border-border">
          {tab === 'letter' && (
            <EditorPanel
              issue={issue}
              onUpdate={updateLocal}
              onSave={handleSave}
              onUpload={handleUpload}
              onSchedule={handleSchedule}
              saving={saving}
            />
          )}
          {tab === 'article' && (
            <ArticlePanel
              articleHtml={issue.article_html}
              coverUrl={issue.cover_url ?? ''}
              youtubeUrl={issue.youtube_url ?? ''}
              subject={issue.subject}
              subtitle={issue.subtitle}
              onUpdate={updateLocal}
            />
          )}
          {tab === 'seo' && (
            <SeoPanel
              seoTitle={issue.seo_title}
              seoDescription={issue.seo_description}
              seoKeywords={issue.seo_keywords ?? []}
              blogSlug={issue.blog_slug ?? ''}
              ogImageUrl={issue.og_image_url ?? ''}
              category={issue.category ?? ''}
              tags={issue.tags ?? []}
              subject={issue.subject}
              articleHtml={issue.article_html || issue.body_html}
              onUpdate={updateLocal}
            />
          )}
        </div>
        <div className="w-[380px] shrink-0">
          <AiChat
            issueId={issue.id}
            currentHtml={tab === 'article' ? issue.article_html : issue.body_html}
            initialMessages={issue.ai_messages}
            onInsertText={handleInsertText}
          />
        </div>
      </div>
    </div>
  )
}
