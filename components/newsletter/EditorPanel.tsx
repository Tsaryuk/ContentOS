'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Eye, Smartphone, Monitor, Save, Upload, Calendar, Loader2 } from 'lucide-react'

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
  const editorRef = useRef<HTMLDivElement>(null)
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null)

  // Auto-save every 30s
  useEffect(() => {
    autoSaveTimer.current = setInterval(() => {
      if (issue.status === 'draft') onSave()
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

  function getSelectedText(): string {
    const sel = window.getSelection()
    return sel ? sel.toString() : ''
  }

  // Expose getSelectedText for AI chat
  useEffect(() => {
    (window as any).__nlGetSelectedText = getSelectedText
  }, [])

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

      {/* Toolbar */}
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
              [&_strong]:text-cream [&_a]:text-accent"
            dangerouslySetInnerHTML={{ __html: issue.body_html || '' }}
            onBlur={e => onUpdate({ body_html: e.currentTarget.innerHTML })}
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
                    blockquote { border-left: 4px solid #1a4fff; padding: 4px 0 4px 16px; margin: 20px 0; color: #333; font-style: italic; }
                    .insight { border-left: 4px solid #1a4fff; padding: 4px 0 4px 16px; margin: 24px 0; }
                    .ins-label { font-family: Helvetica, Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #1a4fff; margin-bottom: 6px; }
                    .ins-text { font-style: italic; color: #111; }
                    .qblock { border-top: 1px solid #e0e0e0; border-bottom: 1px solid #e0e0e0; padding: 20px 0; margin: 28px 0; }
                    .q-label { font-family: Helvetica, Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin-bottom: 8px; }
                    .q-text { font-style: italic; font-size: 19px; color: #111; line-height: 1.4; }
                    a { color: #1a4fff; text-decoration: none; border-bottom: 1px dotted #1a4fff; }
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
