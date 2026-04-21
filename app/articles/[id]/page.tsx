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
import { ThreadsPanel } from '@/components/articles/ThreadsPanel'
import { VideoScriptPanel } from '@/components/articles/VideoScriptPanel'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useVoiceDictation } from '@/lib/hooks/useVoiceDictation'

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
  const [coverVariantLabels, setCoverVariantLabels] = useState<string[]>([])
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
  const chatEndRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  const chatVoice = useVoiceDictation({
    onFinal: (t) => setChatInput(prev => (prev ? prev + ' ' : '') + t),
  })

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

  function restoreSelection(): Selection | null {
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current)
    }
    return sel
  }

  // Link insertion: prompt() blurs the editor, so native execCommand('createLink')
  // loses the original selection and silently does nothing. Save range first,
  // restore after prompt, then wrap selection — or insert the URL as link text
  // when the cursor is collapsed so the button always produces something.
  function insertLink(): void {
    saveSelection()
    const raw = prompt('URL:')
    if (!raw) return
    const trimmed = raw.trim()
    if (!trimmed) return
    const url = /^https?:\/\//i.test(trimmed) || trimmed.startsWith('mailto:')
      ? trimmed
      : `https://${trimmed}`
    const sel = restoreSelection()
    if (!sel || sel.isCollapsed) {
      // No selection — insert the URL itself as the link text.
      execCmd('insertHTML', `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)
      return
    }
    execCmd('createLink', url)
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
      if (!res.body) { alert('Пустой ответ сервера'); return }

      // Stream chunks as they arrive so Safari's ~60s fetch timeout can't
      // abort the connection while Anthropic is still generating markup.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let accumulated = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        accumulated += decoder.decode(value, { stream: true })
      }
      accumulated += decoder.decode()

      const errMatch = accumulated.match(/\n\n\[\[STRUCTURE_ERROR\]\] ([\s\S]+)$/)
      if (errMatch) { alert('Ошибка: ' + errMatch[1].trim()); return }

      let html = accumulated
        .replace(/\u200B/g, '')
        .trim()
        .replace(/^```html?\n?/i, '')
        .replace(/\n?```$/i, '')
        .trim()

      // Extract suggested TITLE/SUBTITLE from service comments at the top of
      // the response, then strip them from the HTML before it hits the editor.
      const titleMatch = html.match(/<!--\s*TITLE:\s*([^]*?)\s*-->/i)
      const subtitleMatch = html.match(/<!--\s*SUBTITLE:\s*([^]*?)\s*-->/i)
      if (titleMatch || subtitleMatch) {
        html = html
          .replace(/<!--\s*TITLE:[^]*?-->\s*/i, '')
          .replace(/<!--\s*SUBTITLE:[^]*?-->\s*/i, '')
          .trim()
      }

      if (!html) { alert('Модель вернула пустой результат'); return }
      pushUndo()

      // Only adopt AI-suggested title/subtitle when the corresponding field is
      // still empty — otherwise users would lose their own hand-picked heading
      // every time they re-run "Оформить AI".
      const patch: Partial<Article> = { body_html: html }
      if (titleMatch && !article.title.trim()) patch.title = titleMatch[1].trim()
      if (subtitleMatch && !article.subtitle.trim()) patch.subtitle = subtitleMatch[1].trim()
      updateLocal(patch)
      if (editorRef.current) editorRef.current.innerHTML = html
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

  // Cover generation — API now returns 3 variants with different prompts
  // (светлая / тёмная / полная гравюра). Keep the order server-sent so the
  // label under each thumbnail matches the layout you'll actually get.
  async function generateCover() {
    if (!article?.title.trim()) return
    setGenCover(true); setCoverOptions([]); setCoverVariantLabels([])
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
      } else if (Array.isArray(data.variants) && data.variants.length > 0) {
        const urls = data.variants.map((v: { url: string }) => v.url)
        const labels = data.variants.map((v: { label: string }) => v.label)
        setCoverOptions(urls)
        setCoverVariantLabels(labels)
        setSelectedCoverIdx(0)
        await selectCover(urls[0])
      } else if (data.urls?.length) {
        // Back-compat: older server response shape without labels.
        setCoverOptions(data.urls)
        setCoverVariantLabels([])
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

  function slugFromTitle() {
    const slug = (article?.title ?? '').toLowerCase()
      .replace(/[а-яё]/g, c => {
        const m: Record<string,string> = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'}
        return m[c] ?? c
      }).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    updateLocal({ blog_slug: slug })
  }

  if (loading) return <div className="flex-1 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground/60" /></div>
  if (!article) return <div className="flex-1 flex items-center justify-center"><p className="text-muted-foreground">Статья не найдена</p></div>

  const ytId = article.youtube_url?.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?\s]+)/)?.[1]
  const isPublished = article.status === 'published'

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <Button variant="ghost" size="icon-sm" asChild>
          <Link href="/articles"><ArrowLeft /></Link>
        </Button>
        <span className="text-sm font-medium text-foreground truncate max-w-[200px]">{article.title || 'Новая статья'}</span>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
          isPublished
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
            : 'bg-muted/60 text-muted-foreground'
        }`}>
          {isPublished ? 'Опубликовано' : 'Черновик'}
        </span>
        <div className="inline-flex items-center gap-0.5 p-0.5 ml-4 rounded-lg bg-card border border-border">
          {([['edit', 'Контент'], ['seo', 'SEO'], ['distribute', 'Дистрибуция']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key as Tab)}
              data-active={tab === key || undefined}
              className="px-3 py-1.5 rounded-md text-xs font-medium transition-colors text-muted-foreground hover:text-foreground data-[active]:bg-muted data-[active]:text-foreground"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <span className="text-[10px] text-muted-foreground/60 tabular-nums">v{article.version}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowWhitePaper(true)}
          title="Режим чистого листа — писать без форматирования, потом AI структурирует"
        >
          <FileText /> Чистый лист
        </Button>
        <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />}
          Сохранить
        </Button>
        {isPublished ? (
          <Button
            variant="ghost"
            size="sm"
            asChild
            className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 hover:bg-emerald-500/20"
          >
            <a href={`https://letters.tsaryuk.ru/articles/${article.blog_slug}.html`} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> На сайте
            </a>
          </Button>
        ) : (
          <Button variant="brand" size="sm" onClick={handlePublish} disabled={publishing || !article.blog_slug}>
            {publishing ? <Loader2 className="animate-spin" /> : <Globe />}
            Опубликовать
          </Button>
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
                className="w-full px-3 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground focus:outline-none focus:border-accent" />
              <input placeholder="Подзаголовок / интрига" value={article.subtitle}
                onChange={e => updateLocal({ subtitle: e.target.value })}
                className="w-full px-3 py-1.5 bg-card border border-border rounded-lg text-xs text-muted-foreground focus:outline-none focus:border-accent" />
              <div className="flex gap-3 items-start">
                <div className="flex-1 space-y-2">
                  <div className="flex gap-2">
                    <input placeholder="URL обложки" value={article.cover_url ?? ''} onChange={e => updateLocal({ cover_url: e.target.value })}
                      className="flex-1 px-3 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-accent" />
                    <label className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1.5">
                      <Upload className="w-3 h-3" /> Загрузить
                      <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
                    </label>
                    <button onClick={generateCover} disabled={genCover || !article.title.trim()}
                      className="px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs hover:bg-accent/20 disabled:opacity-50 flex items-center gap-1.5">
                      {genCover ? <Loader2 className="w-3 h-3 animate-spin" /> : <Image className="w-3 h-3" />} Генерировать
                    </button>
                    <button onClick={() => setShowCoverSettings(v => !v)}
                      className="px-2 py-1.5 border border-border rounded-lg text-xs text-muted-foreground/60 hover:text-foreground"
                      title="Настроить промпт">⚙</button>
                  </div>
                  {showCoverSettings && (
                    <textarea
                      value={coverPrompt}
                      onChange={e => setCoverPrompt(e.target.value)}
                      placeholder="Промпт для сцены (на английском). Например: A lone figure standing at a crossroads in a misty forest, ancient stone pillars. Wide cinematic composition, 16:9. Пусто = сгенерируется из темы."
                      rows={3}
                      className="w-full px-3 py-2 bg-card border border-border rounded-lg text-[11px] text-muted-foreground focus:outline-none focus:border-accent resize-none font-mono" />
                  )}
                  {coverOptions.length > 0 && (
                    <div className="flex gap-2">
                      {coverOptions.map((url, i) => {
                        const label = coverVariantLabels[i] ?? `Вариант ${i + 1}`
                        return (
                          <button key={i}
                            onClick={async () => {
                              setSelectedCoverIdx(i)
                              await selectCover(url)
                            }}
                            disabled={persistingCover}
                            className={`relative flex flex-col items-stretch gap-1 rounded-lg overflow-hidden border-2 transition-colors ${selectedCoverIdx === i ? 'border-accent' : 'border-border hover:border-muted'} disabled:cursor-wait`}
                            title={label}>
                            <img src={url} className="w-28 h-16 object-cover" alt={label} />
                            <span className="px-1 pb-1 text-[9px] text-muted-foreground/80 text-center tabular-nums">{label}</span>
                            {selectedCoverIdx === i && (
                              <div className="absolute top-1 right-1 bg-accent text-white text-[9px] px-1.5 py-0.5 rounded">
                                {persistingCover ? '...' : '✓'}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {article.cover_url && !coverOptions.length && (
                    <img src={article.cover_url} className="w-full h-28 object-cover rounded-lg" alt="" />
                  )}
                  {article.cover_url && (
                    <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer select-none">
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
                      className="flex-1 px-3 py-1.5 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-accent" />
                    {ytId && <span className="text-[10px] text-emerald-500 flex items-center gap-1 shrink-0"><Play className="w-3 h-3" /></span>}
                  </div>
                  {ytId && (
                    <button onClick={insertYoutubeEmbed}
                      className="w-full px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 justify-center">
                      <Play className="w-3 h-3" /> Вставить видео в текст
                    </button>
                  )}
                  <select value={article.category ?? ''} onChange={e => updateLocal({ category: e.target.value || null })}
                    className="w-full px-3 py-1.5 bg-card border border-border rounded-lg text-xs text-muted-foreground focus:outline-none focus:border-accent">
                    <option value="">Категория</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Editor scroll area: toolbar sticky + content scrolls */}
            <div className="flex-1 overflow-y-auto min-h-0">
            <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border/50 sticky top-0 bg-background z-10">
              <button onClick={handleUndo} title="Отменить (Ctrl+Z)" className="p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-accent-surface rounded">
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleRedo} title="Вернуть (Ctrl+Y)" className="p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-accent-surface rounded">
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              <div className="w-px h-4 bg-border mx-1" />
              {[
                { icon: Bold, cmd: () => execCmd('bold'), title: 'Жирный' },
                { icon: Italic, cmd: () => execCmd('italic'), title: 'Курсив' },
                { icon: Heading2, cmd: () => execCmd('formatBlock', 'h2'), title: 'Заголовок' },
                { icon: Quote, cmd: () => execCmd('formatBlock', 'blockquote'), title: 'Цитата' },
                { icon: Link2, cmd: insertLink, title: 'Ссылка' },
                { icon: Minus, cmd: () => execCmd('insertHTML', '<hr class="divider">'), title: 'Разделитель' },
              ].map(({ icon: Icon, cmd, title }, i) => (
                <button
                  key={i}
                  // onMouseDown + preventDefault keeps focus inside the
                  // contentEditable editor so the current selection survives
                  // the click. Without this the Link button would lose the
                  // user's selection before prompt() fired, and createLink
                  // had nothing to wrap → link got inserted at the document
                  // start instead of around the highlighted word.
                  onMouseDown={(e) => { e.preventDefault(); cmd() }}
                  title={title}
                  className="p-1.5 text-muted-foreground/60 hover:text-foreground hover:bg-accent-surface rounded"
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
              <div className="w-px h-4 bg-border mx-1" />
              <button onClick={openImageDialog} title="AI картинка в тексте"
                className="p-1.5 text-muted-foreground/60 hover:text-accent hover:bg-accent-surface rounded">
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
                  className="px-2 py-1 text-[10px] text-muted-foreground/60 hover:text-foreground hover:bg-accent-surface rounded font-medium">{b.label}</button>
              ))}
              <div className="flex-1" />
              <div className="flex gap-1">
                {(['editor', 'desktop', 'mobile'] as const).map(m => (
                  <button key={m} onClick={() => setPreview(m)}
                    className={`px-2 py-1 rounded text-xs ${preview === m ? 'bg-accent/10 text-accent' : 'text-muted-foreground/60 hover:text-muted-foreground'}`}>
                    {m === 'editor' ? 'Редактор' : m === 'desktop' ? <Monitor className="w-3 h-3" /> : <Smartphone className="w-3 h-3" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Editor / Preview */}
            <div>
              {preview === 'editor' ? (
                <div ref={editorRef} contentEditable suppressContentEditableWarning
                  className="p-6 min-h-full text-foreground text-sm leading-relaxed focus:outline-none prose prose-invert max-w-none
                    [&_h2]:text-xs [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:font-bold [&_h2]:text-accent [&_h2]:mt-8 [&_h2]:mb-3
                    [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground
                    [&_.insight]:border-l-2 [&_.insight]:border-accent [&_.insight]:pl-4 [&_.insight]:my-6
                    [&_.ins-label]:text-[10px] [&_.ins-label]:uppercase [&_.ins-label]:tracking-wider [&_.ins-label]:text-accent [&_.ins-label]:mb-1
                    [&_.ins-text]:italic [&_.ins-text]:text-foreground
                    [&_.qblock]:border-y [&_.qblock]:border-border [&_.qblock]:py-5 [&_.qblock]:my-6
                    [&_.q-label]:text-[10px] [&_.q-label]:uppercase [&_.q-label]:tracking-wider [&_.q-label]:text-muted-foreground/60 [&_.q-label]:mb-2
                    [&_.q-text]:italic [&_.q-text]:text-lg [&_.q-text]:text-foreground
                    [&_hr]:border-border [&_hr]:my-6 [&_strong]:text-foreground [&_a]:text-accent
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
                <h2 className="text-sm font-medium text-foreground flex items-center gap-2"><Globe className="w-4 h-4 text-accent" /> SEO и публикация</h2>
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
              <div><label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1.5 block">SEO Title ({article.seo_title.length}/60)</label>
                <input value={article.seo_title} onChange={e => updateLocal({ seo_title: e.target.value })} className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-accent" /></div>
              <div><label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1.5 block">Meta Description ({article.seo_description.length}/160)</label>
                <textarea value={article.seo_description} onChange={e => updateLocal({ seo_description: e.target.value })} rows={3} className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-accent resize-none" /></div>
              <div><label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1.5 block">URL slug</label>
                <div className="flex gap-2">
                  <div className="flex-1 flex items-center bg-card border border-border rounded-lg overflow-hidden">
                    <span className="px-3 text-[10px] text-muted-foreground/60">/articles/</span>
                    <input value={article.blog_slug ?? ''} onChange={e => updateLocal({ blog_slug: e.target.value })} className="flex-1 px-1 py-2 bg-transparent text-xs text-foreground focus:outline-none" />
                    <span className="px-2 text-[10px] text-muted-foreground/60">.html</span>
                  </div>
                  <button onClick={slugFromTitle} className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground">Auto</button>
                </div>
              </div>
              <div><label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1.5 block">Ключевые слова</label>
                <input value={article.seo_keywords.join(', ')} onChange={e => updateLocal({ seo_keywords: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} className="w-full px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-accent" /></div>
              <div><label className="text-[10px] text-muted-foreground/60 uppercase tracking-wider mb-1.5 block">Рубрика</label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIES.map(c => <button key={c} onClick={() => updateLocal({ category: c })} className={`px-3 py-1.5 rounded-full text-xs border ${article.category === c ? 'bg-accent/10 border-accent text-accent' : 'border-border text-muted-foreground/60 hover:text-muted-foreground'}`}>{c}</button>)}
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
              <h2 className="text-sm font-medium text-foreground mb-4">Дистрибуция из статьи</h2>
              <Card className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-accent" />
                    <span className="text-xs font-medium text-foreground">Email рассылка</span>
                  </div>
                  {article.email_issue_id ? (
                    <Button variant="outline" size="sm" asChild className="bg-accent/10 text-accent border-accent/20 hover:bg-accent/20">
                      <Link href={`/newsletter/editor/${article.email_issue_id}`}>
                        <ExternalLink /> Открыть письмо
                      </Link>
                    </Button>
                  ) : (
                    <Button variant="brand" size="sm" onClick={handleToEmail} disabled={creatingEmail}>
                      {creatingEmail ? <Loader2 className="animate-spin" /> : <Mail />}
                      Создать письмо
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground/60 mt-2">AI сократит статью до email-формата и добавит ссылку на полную версию</p>
              </Card>
              <VideoScriptPanel articleId={article.id} articleTitle={article.title} hasBody={Boolean(article.body_html?.trim())} />
              <Card className="p-4 opacity-60">
                <div className="flex items-center gap-2">
                  <Image className="w-4 h-4 text-purple-500" />
                  <span className="text-xs font-medium text-foreground">Карусель</span>
                </div>
                <p className="text-[11px] text-muted-foreground/60 mt-2">Скоро: генерация карусели для Instagram/Telegram</p>
              </Card>
              <ThreadsPanel articleId={article.id} hasBody={Boolean(article.body_html?.trim())} />
            </div>
          )}
        </div>

        {/* AI Chat sidebar */}
        <div className="w-[360px] shrink-0 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
            <Sparkles className="w-4 h-4 text-accent" /><span className="text-xs font-medium text-foreground">AI-ассистент</span>
          </div>
          <div className="px-3 py-2 border-b border-border/50 flex flex-wrap gap-1 shrink-0">
            {QUICK_CMDS.map(c => (
              <button key={c.label} onClick={() => sendChat(c.prompt)} disabled={chatLoading}
                className="px-2.5 py-1 bg-card border border-border rounded-full text-[10px] text-muted-foreground hover:text-foreground hover:border-accent/50 disabled:opacity-50">{c.label}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {chatMessages.length === 0 && <div className="text-center py-8"><Sparkles className="w-8 h-8 text-muted-foreground/60 mx-auto mb-3" /><p className="text-xs text-muted-foreground/60">Спроси что-нибудь или используй команды</p></div>}
            {chatMessages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed ${m.role === 'user' ? 'bg-accent/10 text-foreground' : 'bg-card text-muted-foreground'}`}>
                  <div className="whitespace-pre-wrap">{m.content.slice(0, 2000)}{m.content.length > 2000 ? '...' : ''}</div>
                  {m.role === 'assistant' && <button onClick={() => insertFromChat(m.content)} className="mt-2 text-[10px] text-accent hover:underline">Вставить в редактор</button>}
                </div>
              </div>
            ))}
            {chatLoading && <div className="flex justify-start"><div className="bg-card rounded-xl px-3 py-2"><Loader2 className="w-4 h-4 animate-spin text-accent" /></div></div>}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 border-t border-border shrink-0 space-y-2">
            {chatVoice.listening && chatVoice.interim && (
              <div className="text-[10px] text-accent italic flex items-start gap-1.5">
                <span className="text-red-400 shrink-0">●</span>
                <span className="whitespace-pre-wrap">{chatVoice.interim}</span>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={chatVoice.toggle}
                className={`p-2 rounded-lg ${chatVoice.listening ? 'bg-red-500/20 text-red-400' : 'text-muted-foreground/60 hover:text-muted-foreground'}`}
                title={chatVoice.listening ? 'Остановить запись' : 'Голосовой ввод'}
              >
                {chatVoice.listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat(chatInput)}
                placeholder="Спросить AI..."
                className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-accent"
              />
              <button
                onClick={() => sendChat(chatInput)}
                disabled={!chatInput.trim() || chatLoading}
                className="p-2 bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
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
          <div className="bg-card border border-border rounded-xl p-6 max-w-lg w-full"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <Image className="w-4 h-4 text-accent" />
              <h3 className="text-sm font-medium text-foreground">Вставить AI-картинку</h3>
            </div>
            <p className="text-[11px] text-muted-foreground/60 mb-3">
              Стиль ч/б гравюры применяется автоматически. Опишите сцену на английском (лучше работает) или русском.
            </p>
            <textarea
              value={imagePrompt}
              onChange={e => setImagePrompt(e.target.value)}
              placeholder="A lone tree on a cliff edge, storm clouds swirling above, waves crashing below"
              rows={4}
              autoFocus
              className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:border-accent resize-none font-mono mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowImageDialog(false)}
                disabled={genImage}
                className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
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
