'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, Save, Image, Play, Globe, Mail, Sparkles,
  Bold, Italic, Heading2, Quote, Link2, Minus, Send, Mic, MicOff,
  ExternalLink, Smartphone, Monitor, Upload, Undo2, Redo2, FileText
} from 'lucide-react'
import { WhitePaper } from '@/components/articles/WhitePaper'

interface Article {
  id: string; title: string; subtitle: string; body_html: string
  cover_url: string | null; youtube_url: string | null
  category: string | null; tags: string[]; status: string
  seo_title: string; seo_description: string; seo_keywords: string[]
  blog_slug: string | null; og_image_url: string | null
  email_issue_id: string | null; version: number
  published_at: string | null
  show_cover_in_article: boolean
  draft_text: string
  ai_messages: Array<{ role: 'user' | 'assistant'; content: string }>
}

type Tab = 'edit' | 'seo' | 'distribute'
type Preview = 'editor' | 'desktop' | 'mobile'

const CATEGORIES = ['Мышление', 'Деньги', 'Отношения', 'Стратегия', 'AI', 'Путешествия']

const QUICK_CMDS = [
  { label: 'Черновик', prompt: 'Напиши полный черновик статьи по структуре' },
  { label: 'Улучшить', prompt: 'Улучши текст: добавь разметку H2, цитаты, strong, инсайт, вопрос. Верни HTML.' },
  { label: 'Расширить', prompt: 'Расширь текст: добавь больше примеров, деталей, личных историй. Верни HTML.' },
  { label: 'SEO', prompt: 'Сгенерируй SEO: title (60 символов), description (160), keywords, slug. JSON формат.' },
  { label: 'Заголовки', prompt: 'Придумай 5 вариантов заголовка и подзаголовка' },
]

export default function ArticleEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [article, setArticle] = useState<Article | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<Tab>('edit')
  const [preview, setPreview] = useState<Preview>('editor')
  const [genCover, setGenCover] = useState(false)
  const [coverOptions, setCoverOptions] = useState<string[]>([])
  const [selectedCoverIdx, setSelectedCoverIdx] = useState<number | null>(null)
  const [coverPrompt, setCoverPrompt] = useState('')
  const [showCoverSettings, setShowCoverSettings] = useState(false)
  const [persistingCover, setPersistingCover] = useState(false)
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [imagePrompt, setImagePrompt] = useState('')
  const [genImage, setGenImage] = useState(false)
  const [formatting, setFormatting] = useState(false)
  const savedRangeRef = useRef<Range | null>(null)
  const [showWhitePaper, setShowWhitePaper] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [creatingEmail, setCreatingEmail] = useState(false)

  // AI Chat
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/articles/${id}`)
      const data = await res.json()
      if (data.article) {
        setArticle(data.article)
        setChatMessages(data.article.ai_messages ?? [])
        // Auto-open white paper only for completely empty articles (new, no draft either)
        if (!data.article.body_html?.trim() && !data.article.draft_text?.trim()) {
          setShowWhitePaper(true)
        }
      }
      setLoading(false)
    }
    load()
  }, [id])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  function updateLocal(fields: Partial<Article>) {
    setArticle(prev => prev ? { ...prev, ...fields } : prev)
  }

  function syncEditor() {
    if (editorRef.current) updateLocal({ body_html: editorRef.current.innerHTML })
  }

  const handleSave = useCallback(async () => {
    if (!article || saving) return
    if (editorRef.current) {
      article.body_html = editorRef.current.innerHTML
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/articles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: article.title, subtitle: article.subtitle, body_html: article.body_html,
          cover_url: article.cover_url, youtube_url: article.youtube_url,
          category: article.category, tags: article.tags,
          seo_title: article.seo_title, seo_description: article.seo_description,
          seo_keywords: article.seo_keywords, blog_slug: article.blog_slug, og_image_url: article.og_image_url,
          show_cover_in_article: article.show_cover_in_article,
        }),
      })
      const data = await res.json()
      if (data.article) updateLocal({ version: data.article.version })
    } finally { setSaving(false) }
  }, [article, id, saving])

  useEffect(() => {
    const t = setInterval(() => { if (article?.status === 'draft') handleSave() }, 30000)
    return () => clearInterval(t)
  }, [article?.status, handleSave])

  // Undo/Redo history
  const undoStack = useRef<string[]>([])
  const redoStack = useRef<string[]>([])

  function pushUndo() {
    const html = editorRef.current?.innerHTML ?? ''
    if (undoStack.current[undoStack.current.length - 1] !== html) {
      undoStack.current.push(html)
      if (undoStack.current.length > 50) undoStack.current.shift()
      redoStack.current = []
    }
  }

  // Formatting
  function execCmd(cmd: string, value?: string) {
    pushUndo()
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
  }

  function handleUndo() {
    if (undoStack.current.length === 0) return
    const current = editorRef.current?.innerHTML ?? ''
    redoStack.current.push(current)
    const prev = undoStack.current.pop()!
    if (editorRef.current) editorRef.current.innerHTML = prev
    updateLocal({ body_html: prev })
  }

  function handleRedo() {
    if (redoStack.current.length === 0) return
    const current = editorRef.current?.innerHTML ?? ''
    undoStack.current.push(current)
    const next = redoStack.current.pop()!
    if (editorRef.current) editorRef.current.innerHTML = next
    updateLocal({ body_html: next })
  }

  // Insert YouTube embed at cursor position in editor
  // Save cursor position before opening dialog
  function saveSelection() {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
    }
  }

  async function handleFormat(): Promise<void> {
    if (!article || formatting) return
    const currentHtml = editorRef.current?.innerHTML ?? article.body_html
    // Convert current HTML to plain text to re-format from scratch (paragraphs preserved)
    const plain = currentHtml
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    if (!plain) return
    if (!confirm('AI-оформитель переразметит текст: добавит H2, цитаты, инсайты, вопросы. Слова автора не меняются. Продолжить?')) return
    setFormatting(true)
    try {
      const res = await fetch('/api/articles/structure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: plain }),
      })
      if (!res.ok) {
        const t = await res.text().catch(() => '')
        alert(`Ошибка ${res.status}: ${t.slice(0, 300)}`)
        return
      }
      const data = await res.json()
      if (data.error) { alert(data.error); return }
      if (data.html) {
        pushUndo()
        updateLocal({ body_html: data.html })
        if (editorRef.current) editorRef.current.innerHTML = data.html
      }
    } catch (e) {
      alert('Ошибка: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setFormatting(false) }
  }

  function openImageDialog() {
    saveSelection()
    setImagePrompt('')
    setShowImageDialog(true)
  }

  async function generateInlineImage() {
    if (!imagePrompt.trim() || !article) return
    setGenImage(true)
    try {
      const res = await fetch('/api/articles/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: article.id, prompt: imagePrompt }),
      })
      const data = await res.json()
      if (data.error) { alert(data.error); return }
      if (data.url) {
        // Restore cursor + insert image
        editorRef.current?.focus()
        const sel = window.getSelection()
        if (sel && savedRangeRef.current) {
          sel.removeAllRanges()
          sel.addRange(savedRangeRef.current)
        }
        pushUndo()
        document.execCommand('insertHTML', false,
          `<img class="article-cover draggable-img" src="${data.url}" alt="${imagePrompt.replace(/"/g, '&quot;').slice(0, 100)}" draggable="true" style="width:100%;border-radius:8px;margin:32px 0;aspect-ratio:16/9;object-fit:cover;display:block;cursor:grab"><p></p>`
        )
        syncEditor()
        setShowImageDialog(false)
      }
    } finally { setGenImage(false) }
  }

  function insertYoutubeEmbed() {
    const url = article?.youtube_url
    if (!url) return
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?\s]+)/)
    if (!match) return
    execCmd('insertHTML', `<div class="video-embed" contenteditable="false"><iframe src="https://www.youtube.com/embed/${match[1]}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0;border-radius:8px"></iframe></div><p></p>`)
    syncEditor()
  }

  // Cover generation
  async function generateCover() {
    if (!article?.title.trim()) return
    setGenCover(true); setCoverOptions([])
    try {
      const res = await fetch('/api/articles/cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: article.title,
          description: article.subtitle,
          customPrompt: coverPrompt.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        alert(`Ошибка сервера ${res.status}: ${text.slice(0, 200)}`)
        return
      }

      const data = await res.json()
      if (data.error) {
        alert('Ошибка: ' + data.error)
      } else if (data.urls?.length) {
        setCoverOptions(data.urls)
        setSelectedCoverIdx(0)
        await selectCover(data.urls[0])
      } else {
        alert('Модель не вернула изображений')
      }
    } catch (e) {
      alert('Не удалось загрузить: ' + (e instanceof Error ? e.message : String(e)))
    } finally { setGenCover(false) }
  }

  // Persist fal.ai URL → Supabase storage, then save as cover_url
  async function selectCover(falUrl: string) {
    if (!article) return
    setPersistingCover(true)
    try {
      // If it's already our storage URL, just use it
      if (falUrl.includes('/storage/v1/object/public/articles/')) {
        updateLocal({ cover_url: falUrl })
        return
      }
      const res = await fetch('/api/articles/cover', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fal_url: falUrl, article_id: article.id }),
      })
      const data = await res.json()
      if (data.url) {
        updateLocal({ cover_url: data.url })
      } else {
        // Fallback: keep fal.ai URL even if persist failed
        updateLocal({ cover_url: falUrl })
      }
    } finally { setPersistingCover(false) }
  }

  // Cover upload via file input
  function handleCoverUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      // For now store as data URL; in production would upload to Supabase storage
      updateLocal({ cover_url: reader.result as string })
    }
    reader.readAsDataURL(file)
  }

  // Publish
  async function handlePublish() {
    await handleSave()
    setPublishing(true)
    try {
      const res = await fetch(`/api/articles/${id}/publish`, { method: 'POST' })
      const data = await res.json()
      if (data.error) alert(data.error)
      else { updateLocal({ status: 'published', published_at: new Date().toISOString() }); alert(`Опубликовано: ${data.url}`) }
    } finally { setPublishing(false) }
  }

  // Create email
  async function handleToEmail() {
    await handleSave()
    setCreatingEmail(true)
    try {
      const res = await fetch(`/api/articles/${id}/to-email`, { method: 'POST' })
      const data = await res.json()
      if (data.error) alert(data.error)
      else { updateLocal({ email_issue_id: data.issue.id }); router.push(`/newsletter/editor/${data.issue.id}`) }
    } finally { setCreatingEmail(false) }
  }

  // AI Chat
  async function sendChat(text: string) {
    if (!text.trim() || chatLoading) return
    setChatMessages(prev => [...prev, { role: 'user', content: text }])
    setChatInput(''); setChatLoading(true)
    try {
      const res = await fetch('/api/articles/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: id, message: text, current_html: article?.body_html }),
      })
      const data = await res.json()
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.content ?? data.error ?? 'Ошибка' }])
    } catch { setChatMessages(prev => [...prev, { role: 'assistant', content: 'Ошибка соединения' }]) }
    finally { setChatLoading(false) }
  }

  function insertFromChat(text: string) {
    let html = text.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim()
    if (!html.includes('<')) html = text.split('\n').map(l => l.trim() ? `<p>${l}</p>` : '').join('\n')
    updateLocal({ body_html: (article?.body_html ?? '') + '\n' + html })
    if (editorRef.current) editorRef.current.innerHTML = (article?.body_html ?? '') + '\n' + html
  }

  function toggleVoice() {
    if (listening) { recognitionRef.current?.stop(); setListening(false); return }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    const r = new SR(); r.lang = 'ru-RU'; r.interimResults = false
    r.onresult = (e: any) => { setChatInput(prev => prev + ' ' + e.results[0][0].transcript); setListening(false) }
    r.onerror = () => setListening(false); r.onend = () => setListening(false)
    recognitionRef.current = r; r.start(); setListening(true)
  }

  function slugFromTitle() {
    const slug = (article?.title ?? '').toLowerCase()
      .replace(/[а-яё]/g, c => {
        const m: Record<string,string> = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'}
        return m[c] ?? c
      }).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    updateLocal({ blog_slug: slug })
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-dim" /></div>
  if (!article) return <div className="flex-1 flex items-center justify-center"><p className="text-muted">Статья не найдена</p></div>

  const ytId = article.youtube_url?.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?\s]+)/)?.[1]
  const isPublished = article.status === 'published'

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <Link href="/articles" className="p-1.5 text-dim hover:text-muted"><ArrowLeft className="w-4 h-4" /></Link>
        <span className="text-sm font-medium text-cream truncate max-w-[200px]">{article.title || 'Новая статья'}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${isPublished ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-dim'}`}>
          {isPublished ? 'Опубликовано' : 'Черновик'}
        </span>
        <div className="flex gap-1 ml-4">
          {([['edit', 'Контент'], ['seo', 'SEO'], ['distribute', 'Дистрибуция']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key as Tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${tab === key ? 'bg-accent/10 text-accent' : 'text-dim hover:text-muted'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-[10px] text-dim">v{article.version}</span>
        <button onClick={() => setShowWhitePaper(true)}
          className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream flex items-center gap-1.5"
          title="Режим белого листа — писать без форматирования, потом AI структурирует">
          <FileText className="w-3 h-3" /> Белый лист
        </button>
        <button onClick={handleSave} disabled={saving}
          className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream disabled:opacity-50 flex items-center gap-1.5">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Сохранить
        </button>
        {isPublished ? (
          <a href={`https://letters.tsaryuk.ru/articles/${article.blog_slug}.html`} target="_blank" rel="noopener noreferrer"
            className="px-3 py-1.5 bg-green-500/10 text-green-400 rounded-lg text-xs flex items-center gap-1.5">
            <ExternalLink className="w-3 h-3" /> На сайте
          </a>
        ) : (
          <button onClick={handlePublish} disabled={publishing || !article.blog_slug}
            className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs hover:bg-accent/90 disabled:opacity-50 flex items-center gap-1.5">
            {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />} Опубликовать
          </button>
        )}
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Main content */}
        <div className="flex-1 min-w-0 border-r border-border flex flex-col min-h-0">
          {tab === 'edit' && (<>
            {/* Meta fields — scrollable */}
            <div className="p-4 border-b border-border space-y-3 shrink-0 max-h-[280px] overflow-y-auto">
              <input placeholder="Заголовок статьи" value={article.title}
                onChange={e => updateLocal({ title: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm font-medium text-cream focus:outline-none focus:border-accent" />
              <input placeholder="Подзаголовок / интрига" value={article.subtitle}
                onChange={e => updateLocal({ subtitle: e.target.value })}
                className="w-full px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-muted focus:outline-none focus:border-accent" />
              <div className="flex gap-3 items-start">
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input placeholder="URL обложки" value={article.cover_url ?? ''} onChange={e => updateLocal({ cover_url: e.target.value })}
                      className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent" />
                    <label className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream cursor-pointer flex items-center gap-1.5">
                      <Upload className="w-3 h-3" /> Загрузить
                      <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                    </label>
                    <button onClick={generateCover} disabled={genCover || !article.title.trim()}
                      className="px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs hover:bg-accent/20 disabled:opacity-50 flex items-center gap-1.5">
                      {genCover ? <Loader2 className="w-3 h-3 animate-spin" /> : <Image className="w-3 h-3" />} Генерировать
                    </button>
                    <button onClick={() => setShowCoverSettings(v => !v)}
                      className="px-2 py-1.5 border border-border rounded-lg text-xs text-dim hover:text-cream"
                      title="Настроить промпт">⚙</button>
                  </div>
                  {showCoverSettings && (
                    <textarea
                      value={coverPrompt}
                      onChange={e => setCoverPrompt(e.target.value)}
                      placeholder="Промпт для сцены (на английском). Например: A lone figure standing at a crossroads in a misty forest, ancient stone pillars. Wide cinematic composition, 16:9. Пусто = сгенерируется из темы."
                      rows={3}
                      className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-[11px] text-muted focus:outline-none focus:border-accent resize-none font-mono" />
                  )}
                  {coverOptions.length > 0 && (
                    <div className="flex gap-2">
                      {coverOptions.map((url, i) => (
                        <button key={i}
                          onClick={async () => {
                            setSelectedCoverIdx(i)
                            await selectCover(url)
                          }}
                          disabled={persistingCover}
                          className={`relative rounded-lg overflow-hidden border-2 transition-colors ${selectedCoverIdx === i ? 'border-accent' : 'border-border hover:border-muted'} disabled:cursor-wait`}>
                          <img src={url} className="w-28 h-16 object-cover" alt={`Вариант ${i + 1}`} />
                          {selectedCoverIdx === i && (
                            <div className="absolute top-1 right-1 bg-accent text-white text-[9px] px-1.5 py-0.5 rounded">
                              {persistingCover ? '...' : '✓'}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {article.cover_url && !coverOptions.length && (
                    <img src={article.cover_url} className="w-full h-28 object-cover rounded-lg" alt="" />
                  )}
                  {article.cover_url && (
                    <label className="flex items-center gap-2 text-[11px] text-muted cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={article.show_cover_in_article !== false}
                        onChange={e => updateLocal({ show_cover_in_article: e.target.checked })}
                        className="w-3.5 h-3.5 accent-accent"
                      />
                      Показывать обложку внутри статьи (помимо preview)
                    </label>
                  )}
                </div>
                {/* YouTube + Category */}
                <div className="w-64 space-y-2 shrink-0">
                  <div className="flex gap-2 items-center">
                    <input placeholder="YouTube URL" value={article.youtube_url ?? ''} onChange={e => updateLocal({ youtube_url: e.target.value })}
                      className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent" />
                    {ytId && <span className="text-[10px] text-green-400 flex items-center gap-1 shrink-0"><Play className="w-3 h-3" /></span>}
                  </div>
                  {ytId && (
                    <button onClick={insertYoutubeEmbed}
                      className="w-full px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream flex items-center gap-1.5 justify-center">
                      <Play className="w-3 h-3" /> Вставить видео в текст
                    </button>
                  )}
                  <select value={article.category ?? ''} onChange={e => updateLocal({ category: e.target.value || null })}
                    className="w-full px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-muted focus:outline-none focus:border-accent">
                    <option value="">Категория</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Editor scroll area: toolbar sticky + content scrolls */}
            <div className="flex-1 overflow-y-auto min-h-0">
            <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border/50 sticky top-0 bg-bg z-10">
              <button onClick={handleUndo} title="Отменить (Ctrl+Z)" className="p-1.5 text-dim hover:text-cream hover:bg-white/5 rounded">
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleRedo} title="Вернуть (Ctrl+Y)" className="p-1.5 text-dim hover:text-cream hover:bg-white/5 rounded">
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-border mx-1" />
              {[
                { icon: Bold, cmd: () => execCmd('bold'), title: 'Жирный' },
                { icon: Italic, cmd: () => execCmd('italic'), title: 'Курсив' },
                { icon: Heading2, cmd: () => execCmd('formatBlock', 'h2'), title: 'Заголовок' },
                { icon: Quote, cmd: () => execCmd('formatBlock', 'blockquote'), title: 'Цитата' },
                { icon: Link2, cmd: () => { const u = prompt('URL:'); if (u) execCmd('createLink', u) }, title: 'Ссылка' },
                { icon: Minus, cmd: () => execCmd('insertHTML', '<hr class="divider">'), title: 'Разделитель' },
              ].map(({ icon: Icon, cmd, title }, i) => (
                <button key={i} onClick={cmd} title={title} className="p-1.5 text-dim hover:text-cream hover:bg-white/5 rounded">
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
              <div className="w-px h-4 bg-border mx-1" />
              <button onClick={openImageDialog} title="AI картинка в тексте"
                className="p-1.5 text-dim hover:text-accent hover:bg-white/5 rounded">
                <Image className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleFormat} disabled={formatting} title="AI-оформитель: добавит H2, цитаты, инсайты, вопросы"
                className="px-2 py-1 text-[10px] text-accent hover:bg-accent/10 rounded font-medium flex items-center gap-1 disabled:opacity-40">
                {formatting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                Оформить AI
              </button>
              <div className="w-px h-4 bg-border mx-1" />
              {[
                { label: 'Инсайт', html: '<div class="insight"><div class="ins-label">Главная мысль</div><p class="ins-text">Текст</p></div>' },
                { label: 'Вопрос', html: '<div class="qblock"><div class="q-label">Вопрос для размышления</div><div class="q-text">Текст</div></div>' },
              ].map(b => (
                <button key={b.label} onClick={() => execCmd('insertHTML', b.html)}
                  className="px-2 py-1 text-[10px] text-dim hover:text-cream hover:bg-white/5 rounded font-medium">{b.label}</button>
              ))}
              <div className="flex-1" />
              <div className="flex gap-1">
                {(['editor', 'desktop', 'mobile'] as const).map(m => (
                  <button key={m} onClick={() => setPreview(m)}
                    className={`px-2 py-1 rounded text-xs ${preview === m ? 'bg-accent/10 text-accent' : 'text-dim hover:text-muted'}`}>
                    {m === 'editor' ? 'Редактор' : m === 'desktop' ? <Monitor className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Editor / Preview */}
            <div>
              {preview === 'editor' ? (
                <div ref={editorRef} contentEditable suppressContentEditableWarning
                  className="p-6 min-h-full text-cream text-sm leading-relaxed focus:outline-none prose prose-invert max-w-none
                    [&_h2]:text-xs [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:font-bold [&_h2]:text-accent [&_h2]:mt-8 [&_h2]:mb-3
                    [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted
                    [&_.insight]:border-l-2 [&_.insight]:border-accent [&_.insight]:pl-4 [&_.insight]:my-6
                    [&_.ins-label]:text-[10px] [&_.ins-label]:uppercase [&_.ins-label]:tracking-wider [&_.ins-label]:text-accent [&_.ins-label]:mb-1
                    [&_.ins-text]:italic [&_.ins-text]:text-cream
                    [&_.qblock]:border-y [&_.qblock]:border-border [&_.qblock]:py-5 [&_.qblock]:my-6
                    [&_.q-label]:text-[10px] [&_.q-label]:uppercase [&_.q-label]:tracking-wider [&_.q-label]:text-dim [&_.q-label]:mb-2
                    [&_.q-text]:italic [&_.q-text]:text-lg [&_.q-text]:text-cream
                    [&_hr]:border-border [&_hr]:my-6 [&_strong]:text-cream [&_a]:text-accent
                    [&_.video-embed]:my-6 [&_.video-embed]:rounded-lg [&_.video-embed]:overflow-hidden
                    [&_iframe]:w-full [&_iframe]:border-0"
                  dangerouslySetInnerHTML={{ __html: article.body_html || '<p style="color:#555">Начните писать статью...</p>' }}
                  onBlur={syncEditor}
                  onInput={() => { pushUndo() }}
                  onKeyDown={e => {
                    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); handleUndo() }
                    if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); handleRedo() }
                    // Delete selected image with Backspace/Delete
                    if ((e.key === 'Backspace' || e.key === 'Delete')) {
                      const selected = editorRef.current?.querySelector('img.selected-img')
                      if (selected) {
                        e.preventDefault()
                        pushUndo()
                        selected.remove()
                        syncEditor()
                      }
                    }
                  }}
                  onClick={e => {
                    // Toggle selection on images
                    const target = e.target as HTMLElement
                    // Clear previous selection
                    editorRef.current?.querySelectorAll('img.selected-img').forEach(img => {
                      img.classList.remove('selected-img')
                      ;(img as HTMLElement).style.outline = ''
                    })
                    if (target.tagName === 'IMG') {
                      target.classList.add('selected-img')
                      target.style.outline = '3px solid #2d5a3f'
                    }
                  }} />
              ) : (
                <div className="p-6 flex justify-center">
                  <div className={`bg-black rounded-lg shadow-lg overflow-hidden ${preview === 'mobile' ? 'w-[375px]' : 'w-[680px]'}`}>
                    <iframe srcDoc={`<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;color:#e8e8e8;font-family:'Lora',Georgia,serif;font-size:19px;line-height:1.75;-webkit-font-smoothing:antialiased}.w{max-width:680px;margin:0 auto;padding:48px 24px}h1{font-size:36px;font-weight:400;line-height:1.25;margin-bottom:12px}h2{font-family:'Inter',sans-serif;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin:48px 0 16px;color:#e8e8e8}p{margin-bottom:1.4em}blockquote{border-left:3px solid #2d5a3f;padding:4px 0 4px 20px;margin:24px 0;font-style:italic;color:#888}blockquote cite{display:block;margin-top:8px;font-style:normal;font-size:14px;font-family:'Inter',sans-serif;color:#555}strong{color:#fff}a{color:#888}.sub{font-style:italic;font-size:18px;color:#888;margin-bottom:40px}.insight{border-left:3px solid #2d5a3f;padding:4px 0 4px 20px;margin:32px 0}.ins-label,.ins-text,.qblock,.q-label,.q-text{font-family:'Lora',serif}.ins-label{font-family:'Inter',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#2d5a3f;margin-bottom:6px}.ins-text{font-style:italic;font-size:19px;line-height:1.5}.qblock{border-top:1px solid #1a1a1a;border-bottom:1px solid #1a1a1a;padding:28px 0;margin:40px 0}.q-label{font-family:'Inter',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#555;margin-bottom:10px}.q-text{font-style:italic;font-size:22px;line-height:1.4}hr{border:none;border-top:1px solid #1a1a1a;margin:24px 0}img.cover{width:100%;border-radius:8px;margin-bottom:40px}.video-embed{position:relative;margin:32px 0;border-radius:8px;overflow:hidden}.video-embed iframe{width:100%;aspect-ratio:16/9;border:0}</style><link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;600&display=swap" rel="stylesheet"><div class="w">${article.cover_url ? `<img class="cover" src="${article.cover_url}">` : ''}<h1>${article.title || 'Заголовок'}</h1><p class="sub">${article.subtitle || ''}</p>${article.body_html || ''}</div>`}
                      className="w-full border-0" style={{ height: '80vh' }} />
                  </div>
                </div>
              )}
            </div>
            </div>{/* close scroll area */}
          </>)}

          {tab === 'seo' && (
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-cream flex items-center gap-2"><Globe className="w-4 h-4 text-accent" /> SEO и публикация</h2>
                <button onClick={async () => {
                  const textOnly = article.body_html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 2000)
                  setChatLoading(true)
                  const res = await fetch('/api/articles/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ article_id: id, message: `Сгенерируй SEO для статьи «Личная Стратегия». Тема: "${article.title}"\nТекст: ${textOnly}\nJSON: {"seo_title":"до 60","seo_description":"до 160, CTA","seo_keywords":["ключ1","ключ2"],"blog_slug":"slug","category":"одна из: ${CATEGORIES.join(', ')}","tags":["тег1","тег2"]}` }) })
                  const data = await res.json()
                  try { const p = JSON.parse(data.content.replace(/```json?\n?|```/g, '').trim()); updateLocal({ seo_title: p.seo_title, seo_description: p.seo_description, seo_keywords: p.seo_keywords, blog_slug: p.blog_slug, category: p.category, tags: p.tags }) } catch {}
                  setChatLoading(false)
                }} disabled={chatLoading} className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs flex items-center gap-1.5 disabled:opacity-50">
                  {chatLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI-генерация
                </button>
              </div>
              <div><label className="text-[10px] text-dim uppercase tracking-wider mb-1.5 block">SEO Title ({article.seo_title.length}/60)</label>
                <input value={article.seo_title} onChange={e => updateLocal({ seo_title: e.target.value })} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent" /></div>
              <div><label className="text-[10px] text-dim uppercase tracking-wider mb-1.5 block">Meta Description ({article.seo_description.length}/160)</label>
                <textarea value={article.seo_description} onChange={e => updateLocal({ seo_description: e.target.value })} rows={3} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent resize-none" /></div>
              <div><label className="text-[10px] text-dim uppercase tracking-wider mb-1.5 block">URL slug</label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center bg-surface border border-border rounded-lg overflow-hidden">
                    <span className="px-3 text-[10px] text-dim">/articles/</span>
                    <input value={article.blog_slug ?? ''} onChange={e => updateLocal({ blog_slug: e.target.value })} className="flex-1 px-1 py-2 bg-transparent text-xs text-cream focus:outline-none" />
                    <span className="px-2 text-[10px] text-dim">.html</span>
                  </div>
                  <button onClick={slugFromTitle} className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream">Auto</button>
                </div>
              </div>
              <div><label className="text-[10px] text-dim uppercase tracking-wider mb-1.5 block">Ключевые слова</label>
                <input value={article.seo_keywords.join(', ')} onChange={e => updateLocal({ seo_keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent" /></div>
              <div><label className="text-[10px] text-dim uppercase tracking-wider mb-1.5 block">Рубрика</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map(c => <button key={c} onClick={() => updateLocal({ category: c })} className={`px-3 py-1.5 rounded-full text-xs border ${article.category === c ? 'bg-accent/10 border-accent text-accent' : 'border-border text-dim hover:text-muted'}`}>{c}</button>)}
                </div></div>
              <div className="p-4 bg-white rounded-lg">
                <div className="text-[11px] text-green-700 mb-0.5">letters.tsaryuk.ru &rsaquo; articles &rsaquo; {article.blog_slug || 'slug'}</div>
                <div className="text-base text-blue-700 font-medium mb-1">{article.seo_title || article.title || 'Заголовок'}</div>
                <div className="text-xs text-gray-600">{article.seo_description || 'Описание...'}</div>
              </div>
            </div>
          )}

          {tab === 'distribute' && (
            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <h2 className="text-sm font-medium text-cream mb-4">Дистрибуция из статьи</h2>
              <div className="p-4 bg-surface border border-border rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-accent" /><span className="text-xs font-medium text-cream">Email рассылка</span></div>
                  {article.email_issue_id ? (
                    <Link href={`/newsletter/editor/${article.email_issue_id}`} className="px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs flex items-center gap-1.5">
                      <ExternalLink className="w-3 h-3" /> Открыть письмо
                    </Link>
                  ) : (
                    <button onClick={handleToEmail} disabled={creatingEmail}
                      className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs disabled:opacity-50 flex items-center gap-1.5">
                      {creatingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />} Создать письмо
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-dim mt-2">AI сократит статью до email-формата и добавит ссылку на полную версию</p>
              </div>
              <div className="p-4 bg-surface border border-border rounded-xl opacity-60">
                <div className="flex items-center gap-2"><Play className="w-4 h-4 text-red-400" /><span className="text-xs font-medium text-cream">Сценарий для YouTube</span></div>
                <p className="text-[11px] text-dim mt-2">Скоро: генерация сценария для видео из статьи</p>
              </div>
              <div className="p-4 bg-surface border border-border rounded-xl opacity-60">
                <div className="flex items-center gap-2"><Image className="w-4 h-4 text-purple-400" /><span className="text-xs font-medium text-cream">Карусель</span></div>
                <p className="text-[11px] text-dim mt-2">Скоро: генерация карусели для Instagram/Telegram</p>
              </div>
              <div className="p-4 bg-surface border border-border rounded-xl opacity-60">
                <div className="flex items-center gap-2"><Send className="w-4 h-4 text-gray-400" /><span className="text-xs font-medium text-cream">Threads</span></div>
                <p className="text-[11px] text-dim mt-2">Скоро: генерация тредов из ключевых мыслей</p>
              </div>
            </div>
          )}
        </div>

        {/* AI Chat sidebar */}
        <div className="w-[360px] shrink-0 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
            <Sparkles className="w-4 h-4 text-accent" /><span className="text-xs font-medium text-cream">AI-ассистент</span>
          </div>
          <div className="px-3 py-2 border-b border-border/50 flex flex-wrap gap-1 shrink-0">
            {QUICK_CMDS.map(c => (
              <button key={c.label} onClick={() => sendChat(c.prompt)} disabled={chatLoading}
                className="px-2.5 py-1 bg-surface border border-border rounded-full text-[10px] text-muted hover:text-cream hover:border-accent/50 disabled:opacity-50">{c.label}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {chatMessages.length === 0 && <div className="text-center py-8"><Sparkles className="w-8 h-8 text-dim mx-auto mb-3" /><p className="text-xs text-dim">Спроси что-нибудь или используй команды</p></div>}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed ${m.role === 'user' ? 'bg-accent/10 text-cream' : 'bg-surface text-muted'}`}>
                  <div className="whitespace-pre-wrap">{m.content.slice(0, 2000)}{m.content.length > 2000 ? '...' : ''}</div>
                  {m.role === 'assistant' && <button onClick={() => insertFromChat(m.content)} className="mt-2 text-[10px] text-accent hover:underline">Вставить в редактор</button>}
                </div>
              </div>
            ))}
            {chatLoading && <div className="flex justify-start"><div className="bg-surface rounded-xl px-3 py-2"><Loader2 className="w-4 h-4 animate-spin text-accent" /></div></div>}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 border-t border-border flex gap-2 shrink-0">
            <button onClick={toggleVoice} className={`p-2 rounded-lg ${listening ? 'bg-red-500/20 text-red-400' : 'text-dim hover:text-muted'}`}>
              {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat(chatInput)}
              placeholder="Спросить AI..." className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent" />
            <button onClick={() => sendChat(chatInput)} disabled={!chatInput.trim() || chatLoading}
              className="p-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50"><Send className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Inline image generation modal */}
      {showWhitePaper && (
        <WhitePaper
          articleId={article.id}
          initialText={article.draft_text || ''}
          onClose={() => setShowWhitePaper(false)}
          onDraftSave={draft => updateLocal({ draft_text: draft })}
          onDone={html => {
            updateLocal({ body_html: html })
            if (editorRef.current) editorRef.current.innerHTML = html
            setShowWhitePaper(false)
          }}
        />
      )}

      {showImageDialog && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-6"
          onClick={() => !genImage && setShowImageDialog(false)}>
          <div className="bg-surface border border-border rounded-xl p-6 max-w-lg w-full"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Image className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-medium text-cream">Вставить AI-картинку</h3>
            </div>
            <p className="text-[11px] text-dim mb-3">
              Стиль ч/б гравюры применяется автоматически. Опишите сцену на английском (лучше работает) или русском.
            </p>
            <textarea
              value={imagePrompt}
              onChange={e => setImagePrompt(e.target.value)}
              placeholder="A lone tree on a cliff edge, storm clouds swirling above, waves crashing below"
              rows={4}
              autoFocus
              className="w-full px-3 py-2 bg-bg border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent resize-none font-mono mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowImageDialog(false)}
                disabled={genImage}
                className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream disabled:opacity-50">
                Отмена
              </button>
              <button
                onClick={generateInlineImage}
                disabled={!imagePrompt.trim() || genImage}
                className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs hover:bg-accent/90 disabled:opacity-50 flex items-center gap-1.5">
                {genImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <Image className="w-3 h-3" />}
                {genImage ? 'Генерация...' : 'Сгенерировать и вставить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
