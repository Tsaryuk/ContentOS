'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Eye, Smartphone, Monitor, Save, Upload, Calendar, Loader2, Sparkles,
  Bold, Italic, Heading2, Quote, Link2, List, Minus, Type, ClipboardCopy, Check
} from 'lucide-react'

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

const CATEGORIES = ['Мышление', 'Деньги', 'Отношения', 'Стратегия', 'AI', 'Путешествия']

export function EditorPanel({ issue, onUpdate, onSave, onUpload, onSchedule, saving }: EditorPanelProps) {
  const [preview, setPreview] = useState<PreviewMode>('edit')
  const [scheduleDate, setScheduleDate] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)
  const [enhancing, setEnhancing] = useState(false)
  const [copying, setCopying] = useState(false)
  const [justCopied, setJustCopied] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null)

  // Fetch the fully template-wrapped email HTML and drop it on the clipboard
  // so the user can paste it straight into Unisender (or any other ESP) by
  // hand when the upload flow isn't enough.
  async function handleCopyHtml(): Promise<void> {
    if (copying) return
    setCopying(true)
    try {
      // Save pending edits first so the copied HTML reflects what's in the
      // editor right now, not what was last auto-saved.
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
        // Legacy fallback (e.g. non-secure contexts).
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

  useEffect(() => {
    autoSaveTimer.current = setInterval(() => {
      if (issue.status === 'draft') onSave()
    }, 30000)
    return () => {
      if (autoSaveTimer.current) clearInterval(autoSaveTimer.current)
    }
  }, [issue.status, onSave])

  // Sync the contentEditable DOM with body_html when the parent updates it
  // externally — e.g. after the chat wizard fills a section server-side.
  // Without this the editor would keep its stale innerHTML because React
  // doesn't re-run dangerouslySetInnerHTML when the DOM was mutated by the
  // user's typing.
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    const next = stripEmailWrapper(issue.body_html) || ''
    if (el.innerHTML !== next) {
      el.innerHTML = next
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue.body_html])

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

  function getSelectedText(): string {
    const sel = window.getSelection()
    return sel ? sel.toString() : ''
  }

  useEffect(() => {
    (window as any).__nlGetSelectedText = getSelectedText
  }, [])

  // Formatting commands
  // Strip email wrapper (DOCTYPE, head, style, body, .wrap div) — show only content
  function stripEmailWrapper(html: string): string {
    if (!html) return ''
    let clean = html
    // Remove DOCTYPE, html, head, style tags
    clean = clean.replace(/<!DOCTYPE[^>]*>/gi, '')
    clean = clean.replace(/<html[^>]*>/gi, '').replace(/<\/html>/gi, '')
    clean = clean.replace(/<head[\s\S]*?<\/head>/gi, '')
    clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '')
    clean = clean.replace(/<body[^>]*>/gi, '').replace(/<\/body>/gi, '')
    // Remove preheader hidden div
    clean = clean.replace(/<div class="preheader"[\s\S]*?<\/div>/gi, '')
    // Unwrap .wrap div
    clean = clean.replace(/<div class="wrap">/gi, '').replace(/<\/div>\s*$/gi, '')
    // Remove footer
    clean = clean.replace(/<div class="footer"[\s\S]*$/gi, '')
    return clean.trim()
  }

  function execCmd(cmd: string, value?: string) {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
    syncHtml()
  }

  function syncHtml() {
    if (editorRef.current) {
      onUpdate({ body_html: editorRef.current.innerHTML })
    }
  }

  function insertHeading() {
    execCmd('formatBlock', 'h2')
  }

  function insertBlockquote() {
    execCmd('formatBlock', 'blockquote')
  }

  function insertDivider() {
    execCmd('insertHTML', '<hr class="divider">')
  }

  function insertInsightBlock() {
    execCmd('insertHTML', `
      <div class="insight">
        <div class="ins-label">Главная мысль</div>
        <p class="ins-text">Ваша ключевая мысль здесь</p>
      </div>
    `)
  }

  function insertQuestionBlock() {
    execCmd('insertHTML', `
      <div class="qblock">
        <div class="q-label">Вопрос недели</div>
        <div class="q-text">Ваш вопрос здесь</div>
      </div>
    `)
  }

  function insertLink() {
    // Same pattern as article editor: prompt() blurs the editor, so we save
    // the range first and restore it after. If selection is collapsed, drop
    // the URL itself as link text instead of silently doing nothing.
    const sel0 = window.getSelection()
    const saved = sel0 && sel0.rangeCount > 0 ? sel0.getRangeAt(0).cloneRange() : null
    const raw = prompt('URL ссылки:')
    if (!raw) return
    const trimmed = raw.trim()
    if (!trimmed) return
    const url = /^https?:\/\//i.test(trimmed) || trimmed.startsWith('mailto:')
      ? trimmed
      : `https://${trimmed}`
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (sel && saved) {
      sel.removeAllRanges()
      sel.addRange(saved)
    }
    if (!sel || sel.isCollapsed) {
      execCmd('insertHTML', `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)
      return
    }
    execCmd('createLink', url)
  }

  // AI Enhance
  async function handleEnhance() {
    const currentHtml = editorRef.current?.innerHTML ?? issue.body_html
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
        // Remove possible markdown code blocks
        let html = data.content.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim()
        onUpdate({ body_html: html })
        if (editorRef.current) {
          editorRef.current.innerHTML = html
        }
      }
    } finally {
      setEnhancing(false)
    }
  }

  const formatButtons = [
    { icon: Bold, title: 'Жирный', action: () => execCmd('bold') },
    { icon: Italic, title: 'Курсив', action: () => execCmd('italic') },
    { icon: Heading2, title: 'Заголовок H2', action: insertHeading },
    { icon: Quote, title: 'Цитата', action: insertBlockquote },
    { icon: Link2, title: 'Ссылка', action: insertLink },
    { icon: List, title: 'Список', action: () => execCmd('insertUnorderedList') },
    { icon: Minus, title: 'Разделитель', action: insertDivider },
  ]

  const blockButtons = [
    { label: 'Инсайт', action: insertInsightBlock },
    { label: 'Вопрос', action: insertQuestionBlock },
    { label: 'P', action: () => execCmd('formatBlock', 'p'), title: 'Абзац' },
  ]

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

      {/* Formatting toolbar */}
      <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border/50">
        {formatButtons.map(({ icon: Icon, title, action }) => (
          <button
            key={title}
            // onMouseDown + preventDefault keeps the contentEditable
            // selection intact while clicking the toolbar — essential for
            // createLink via prompt() which otherwise gets an empty range.
            onMouseDown={(e) => { e.preventDefault(); action() }}
            title={title}
            className="p-1.5 text-dim hover:text-cream hover:bg-white/5 rounded transition-colors"
          >
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
        <div className="w-px h-4 bg-border mx-1" />
        {blockButtons.map(({ label, action, title }) => (
          <button
            key={label}
            onMouseDown={(e) => { e.preventDefault(); action() }}
            title={title ?? label}
            className="px-2 py-1 text-[10px] text-dim hover:text-cream hover:bg-white/5 rounded transition-colors font-medium"
          >
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={handleEnhance}
          disabled={enhancing}
          className="px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs hover:bg-accent/20 disabled:opacity-50 flex items-center gap-1.5"
        >
          {enhancing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          Улучшить AI
        </button>
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
      <div className="flex-1 overflow-y-auto">
        {preview === 'edit' ? (
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            className="p-6 min-h-full text-cream text-sm leading-relaxed focus:outline-none prose prose-invert max-w-none
              [&_h2]:text-xs [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:font-bold [&_h2]:text-accent [&_h2]:mt-8 [&_h2]:mb-3
              [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted
              [&_.insight]:border-l-2 [&_.insight]:border-accent [&_.insight]:pl-4 [&_.insight]:my-6
              [&_.ins-label]:text-[10px] [&_.ins-label]:uppercase [&_.ins-label]:tracking-wider [&_.ins-label]:text-accent [&_.ins-label]:mb-1
              [&_.ins-text]:italic [&_.ins-text]:text-cream
              [&_.qblock]:border-y [&_.qblock]:border-border [&_.qblock]:py-5 [&_.qblock]:my-6
              [&_.q-label]:text-[10px] [&_.q-label]:uppercase [&_.q-label]:tracking-wider [&_.q-label]:text-dim [&_.q-label]:mb-2
              [&_.q-text]:italic [&_.q-text]:text-lg [&_.q-text]:text-cream
              [&_hr]:border-border [&_hr]:my-6
              [&_strong]:text-cream [&_a]:text-accent"
            dangerouslySetInnerHTML={{ __html: stripEmailWrapper(issue.body_html) || '' }}
            onBlur={syncHtml}
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
