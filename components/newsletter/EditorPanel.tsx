'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Smartphone, Monitor, Save, Upload, Calendar, Loader2, Sparkles,
  ClipboardCopy, Check, RefreshCw,
} from 'lucide-react'
import { ARTICLE_CATEGORIES } from '@/lib/articles/categories'
import { ArticleEditor, type ArticleEditorHandle } from '@/components/articles/editor/ArticleEditor'
import { EmailSection } from '@/components/articles/editor/extensions/EmailSection'

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
}

interface EditorPanelProps {
  issue: Issue
  onUpdate: (fields: Partial<Issue>) => void
  onSave: () => Promise<void>
  onUpload: () => Promise<void>
  onSchedule: (startTime?: string) => Promise<void>
  saving: boolean
}

type PreviewMode = 'edit' | 'desktop' | 'mobile'

const CATEGORIES = ARTICLE_CATEGORIES

// Register the email-section extension once outside the component so React
// doesn't re-instantiate the schema on every parent re-render. Same for the
// extension list arg to ArticleEditor — keeping the reference stable keeps
// useEditor's deps stable.
const NEWSLETTER_EXTRA_EXTENSIONS = [EmailSection]

// Strip the on-disk email shell (DOCTYPE/<head>/<style>/<body>/.wrap div/
// .footer) so the editor only renders the section content. body_html in
// nl_issues currently stores either:
//   (a) just the body — recent rows produced by renderEmailBody()
//   (b) a full pre-render template — legacy rows from before the section
//       split was introduced. We keep this helper so opening such legacy
//       issues doesn't show the raw shell as text.
function stripEmailWrapper(html: string): string {
  if (!html) return ''
  let clean = html
  clean = clean.replace(/<!DOCTYPE[^>]*>/gi, '')
  clean = clean.replace(/<html[^>]*>/gi, '').replace(/<\/html>/gi, '')
  clean = clean.replace(/<head[\s\S]*?<\/head>/gi, '')
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '')
  clean = clean.replace(/<body[^>]*>/gi, '').replace(/<\/body>/gi, '')
  clean = clean.replace(/<div class="preheader"[\s\S]*?<\/div>/gi, '')
  clean = clean.replace(/<div class="wrap">/gi, '').replace(/<\/div>\s*$/gi, '')
  clean = clean.replace(/<div class="footer"[\s\S]*$/gi, '')
  return clean.trim()
}

export function EditorPanel({ issue, onUpdate, onSave, onUpload, onSchedule, saving }: EditorPanelProps) {
  const [preview, setPreview] = useState<PreviewMode>('edit')
  const [scheduleDate, setScheduleDate] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [copying, setCopying] = useState(false)
  const [justCopied, setJustCopied] = useState(false)
  const editorRef = useRef<ArticleEditorHandle | null>(null)
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null)

  // Fetch the fully template-wrapped email HTML and drop it on the clipboard
  // so the user can paste it straight into Unisender (or any other ESP) by
  // hand when the upload flow isn't enough.
  async function handleCopyHtml(): Promise<void> {
    if (copying) return
    setCopying(true)
    try {
      await onSave()
      const res = await fetch(`/api/newsletter/issues/${issue.id}/html`)
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        alert(`Ошибка ${res.status}: ${t.slice(0, 200)}`)
        return
      }
      const html = await res.text()
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(html)
      } else {
        const ta = document.createElement('textarea')
        ta.value = html
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setJustCopied(true)
      setTimeout(() => setJustCopied(false), 2000)
    } catch (e) {
      alert('Не скопировалось: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCopying(false)
    }
  }

  // Autosave every 30s — matches the article editor's behaviour. Covers
  // draft + uploaded so a quick fix after upload (typo in subject etc.)
  // still gets persisted.
  useEffect(() => {
    autoSaveTimer.current = setInterval(() => {
      if (issue.status === 'draft' || issue.status === 'uploaded') onSave()
    }, 30000)
    return () => {
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current)
    }
  }, [issue.status, onSave])

  const getPreviewHtml = useCallback(() => {
    const tag = issue.tag || 'Разговор о...'
    const subject = issue.subject || '[Заголовок письма]'
    const subtitle = issue.subtitle || '[Подзаголовок]'
    return `
      <div class="tag">${tag}</div>
      <h1>${subject}</h1>
      <p class="sub">${subtitle}</p>
      <hr class="divider">
      ${issue.body_html || '<p style="color:#999">Начните писать...</p>'}
    `
  }, [issue.tag, issue.subject, issue.subtitle, issue.body_html])

  // Regenerate the AI-filled sections (digest, practice, cta_article) from
  // the linked article using the current EMAIL_WRITER_PROMPT. Other sections
  // (philosophy, lifehack, anons, signoff) are not touched — they hold the
  // user's hand-written content. Useful when the prompt has evolved and the
  // user wants to re-run an existing draft against the new shape.
  async function handleRegenerate() {
    if (regenerating) return
    const ok = window.confirm(
      'Перегенерировать секции "Главное из статьи", "Практическое задание" и CTA из связанной статьи?\nВручную написанные секции (Личная философия, Лайфхак, Анонс) затронуты не будут.',
    )
    if (!ok) return
    setRegenerating(true)
    try {
      // Save first so any in-flight edits don't get overwritten by the
      // server's response.
      await onSave()
      const res = await fetch(`/api/newsletter/issues/${issue.id}/regenerate-from-article`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(`Не удалось: ${data.error ?? res.status}`)
        return
      }
      if (data.issue?.body_html) onUpdate({ body_html: data.issue.body_html })
    } catch (e) {
      alert('Ошибка: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setRegenerating(false)
    }
  }

  // AI Enhance — sends current body_html to the newsletter AI endpoint and
  // replaces the body with the model's response. The TipTap value prop
  // pushes the new HTML into the editor through ArticleEditor's internal
  // useEffect(value).
  async function handleEnhance() {
    const currentHtml = editorRef.current?.getHTML() ?? issue.body_html
    if (!currentHtml?.trim()) return

    setEnhancing(true)
    try {
      const res = await fetch('/api/newsletter/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue_id: issue.id,
          message: `Улучши текст этого письма. Сделай:
1. Добавь правильную HTML-разметку: заголовки <h2>, цитаты <blockquote>, выделение <strong>
2. Улучши стиль: сделай текст живее, добавь личные примеры, убери воду
3. Добавь блок "Главная мысль" (div class="insight") и "Вопрос недели" (div class="qblock") если их нет
4. Сохрани структуру: вступление → 2-3 раздела → инсайт → вопрос → задание → подкаст → лайфхак → анонс

Верни ТОЛЬКО готовый HTML для body письма, без обёрток и пояснений.`,
          current_html: currentHtml,
        }),
      })
      const data = await res.json()
      if (data.content) {
        const html = data.content.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim()
        onUpdate({ body_html: html })
      }
    } finally {
      setEnhancing(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header fields */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex gap-3">
          <input
            type="number"
            placeholder="№"
            value={issue.issue_number ?? ''}
            onChange={e => onUpdate({ issue_number: e.target.value ? parseInt(e.target.value) : null })}
            className="w-16 px-2 py-1.5 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent"
          />
          <input
            placeholder="Тег (напр. Разговор о...)"
            value={issue.tag}
            onChange={e => onUpdate({ tag: e.target.value })}
            className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent"
          />
          <select
            value={issue.category ?? ''}
            onChange={e => onUpdate({ category: e.target.value || null })}
            className="px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-muted focus:outline-none focus:border-accent"
          >
            <option value="">Категория</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <input
          placeholder="Тема письма"
          value={issue.subject}
          onChange={e => onUpdate({ subject: e.target.value })}
          className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm font-medium text-cream focus:outline-none focus:border-accent"
        />
        <div className="flex gap-3">
          <input
            placeholder="Прехедер (текст после темы в инбоксе)"
            value={issue.preheader}
            onChange={e => onUpdate({ preheader: e.target.value })}
            className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-muted focus:outline-none focus:border-accent"
          />
          <input
            placeholder="Подзаголовок / интрига"
            value={issue.subtitle}
            onChange={e => onUpdate({ subtitle: e.target.value })}
            className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-muted focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* View mode + actions */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        <div className="flex gap-1">
          {(['edit', 'desktop', 'mobile'] as const).map(m => (
            <button
              key={m}
              onClick={() => setPreview(m)}
              className={`px-2.5 py-1 rounded text-xs flex items-center gap-1.5 ${
                preview === m ? 'bg-accent/10 text-accent' : 'text-dim hover:text-muted'
              }`}
            >
              {m === 'edit' ? 'Редактор' : m === 'desktop' ? <><Monitor className="w-3 h-3" /> Desktop</> : <><Smartphone className="w-3 h-3" /> Mobile</>}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-dim">v{issue.version}</span>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            title="Перегенерировать AI-секции (digest + practice + CTA) из связанной статьи"
            className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream disabled:opacity-50 flex items-center gap-1.5"
          >
            {regenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Перегенерировать
          </button>
          <button
            onClick={handleEnhance}
            disabled={enhancing}
            className="px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs hover:bg-accent/20 disabled:opacity-50 flex items-center gap-1.5"
          >
            {enhancing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            Улучшить AI
          </button>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Сохранить
          </button>
          <button
            onClick={handleCopyHtml}
            disabled={copying}
            title="Скопировать полный HTML письма — вставь в Unisender вручную если нужно"
            className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream disabled:opacity-50 flex items-center gap-1.5"
          >
            {copying
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : justCopied
                ? <Check className="w-3 h-3 text-emerald-400" />
                : <ClipboardCopy className="w-3 h-3" />}
            {justCopied ? 'Скопировано' : 'Копировать HTML'}
          </button>
          <button
            onClick={onUpload}
            disabled={issue.status !== 'draft' && issue.status !== 'uploaded'}
            className="px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs hover:bg-accent/20 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Upload className="w-3 h-3" />
            В Unisender
          </button>
          <div className="relative">
            <button
              onClick={() => setShowSchedule(!showSchedule)}
              disabled={issue.status !== 'uploaded'}
              className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs hover:bg-accent/90 disabled:opacity-50 flex items-center gap-1.5"
            >
              <Calendar className="w-3 h-3" />
              Запланировать
            </button>
            {showSchedule && (
              <div className="absolute right-0 top-full mt-2 p-3 bg-surface border border-border rounded-xl shadow-xl z-20 w-64">
                <p className="text-xs text-muted mb-2">Дата и время отправки (UTC)</p>
                <input
                  type="datetime-local"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  className="w-full px-2 py-1.5 bg-bg border border-border rounded-lg text-xs text-cream mb-2"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => { onSchedule(scheduleDate.replace('T', ' ')); setShowSchedule(false) }}
                    disabled={!scheduleDate}
                    className="flex-1 px-3 py-1.5 bg-accent text-white rounded-lg text-xs disabled:opacity-50"
                  >
                    Запланировать
                  </button>
                  <button
                    onClick={() => { onSchedule(); setShowSchedule(false) }}
                    className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream"
                  >
                    Сейчас
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {preview === 'edit' ? (
          <ArticleEditor
            ref={editorRef}
            value={stripEmailWrapper(issue.body_html)}
            onChange={(html) => onUpdate({ body_html: html })}
            articleId={issue.id}
            extraExtensions={NEWSLETTER_EXTRA_EXTENSIONS}
            placeholder="Текст письма…"
          />
        ) : (
          <div className="p-6 flex justify-center">
            <div
              className={`bg-white rounded-lg shadow-lg overflow-hidden ${
                preview === 'mobile' ? 'w-[375px]' : 'w-[600px]'
              }`}
            >
              <iframe
                srcDoc={`
                  <style>
                    body { margin: 0; padding: 0; background: #fff; color: #333; font-family: Georgia, serif; font-size: 18px; line-height: 1.6em; }
                    .wrap { max-width: 500px; margin: 20px auto; padding: 0 20px; }
                    p { margin: 0 0 1em; }
                    h1 { font-size: 28px; font-weight: normal; color: #111; margin: 0 0 6px; line-height: 1.2; }
                    h2 { font-size: 20px; font-weight: bold; color: #111; margin: 32px 0 8px; font-family: Helvetica, Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.05em; }
                    .tag { font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #999; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
                    .sub { font-style: italic; color: #666; font-size: 17px; margin-bottom: 24px; }
                    .divider { border: none; border-top: 1px solid #e0e0e0; margin: 24px 0; }
                    blockquote { border-left: 4px solid #2d5a3f; padding: 4px 0 4px 16px; margin: 20px 0; color: #333; font-style: italic; }
                    blockquote cite { display: block; margin-top: 6px; font-style: normal; font-size: 13px; color: #999; font-family: Helvetica, Arial, sans-serif; }
                    .insight { border-left: 4px solid #2d5a3f; padding: 4px 0 4px 16px; margin: 24px 0; }
                    .ins-label { font-family: Helvetica, Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #2d5a3f; margin-bottom: 6px; }
                    .ins-text { font-style: italic; color: #111; }
                    .qblock { border-top: 1px solid #e0e0e0; border-bottom: 1px solid #e0e0e0; padding: 20px 0; margin: 28px 0; }
                    .q-label { font-family: Helvetica, Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin-bottom: 8px; }
                    .q-text { font-style: italic; font-size: 19px; color: #111; line-height: 1.4; }
                    a { color: #2d5a3f; text-decoration: none; border-bottom: 1px dotted #2d5a3f; }
                    .muted { color: #888; font-size: 15px; }
                    strong { color: #111; }
                    img { max-width: 100%; height: auto; display: block; margin: 24px auto; border-radius: 6px; }
                    .cta-article { text-align: center; margin: 32px 0 24px; }
                    .cta-article a.cta-button { display: inline-block; background: #2d5a3f; color: #fff; padding: 12px 24px; border-radius: 6px; font-family: Helvetica, Arial, sans-serif; font-size: 14px; font-weight: 600; text-decoration: none; border: none; }
                    .cta-article .cta-hint { font-family: Helvetica, Arial, sans-serif; font-size: 11px; color: #999; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.08em; }
                  </style>
                  <div class="wrap">${getPreviewHtml()}</div>
                `}
                className="w-full border-0"
                style={{ height: '80vh' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
