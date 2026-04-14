'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, Save, Image, Play, Globe, Mail, Sparkles,
  Bold, Italic, Heading2, Quote, Link2, Minus, Send, Mic, MicOff,
  ExternalLink, Smartphone, Monitor
} from 'lucide-react'

interface Article {
  id: string; title: string; subtitle: string; body_html: string
  cover_url: string | null; youtube_url: string | null
  category: string | null; tags: string[]; status: string
  seo_title: string; seo_description: string; seo_keywords: string[]
  blog_slug: string | null; og_image_url: string | null
  email_issue_id: string | null; version: number
  published_at: string | null
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
    syncEditor()
    setSaving(true)
    try {
      const res = await fetch(`/api/articles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: article.title, subtitle: article.subtitle, body_html: editorRef.current?.innerHTML ?? article.body_html,
          cover_url: article.cover_url, youtube_url: article.youtube_url,
          category: article.category, tags: article.tags,
          seo_title: article.seo_title, seo_description: article.seo_description,
          seo_keywords: article.seo_keywords, blog_slug: article.blog_slug, og_image_url: article.og_image_url,
        }),
      })
      const data = await res.json()
      if (data.article) updateLocal({ version: data.article.version })
    } finally { setSaving(false) }
  }, [article, id, saving])

  // Auto-save
  useEffect(() => {
    const t = setInterval(() => { if (article?.status === 'draft') handleSave() }, 30000)
    return () => clearInterval(t)
  }, [article?.status, handleSave])

  // Formatting
  function execCmd(cmd: string, value?: string) { document.execCommand(cmd, false, value); editorRef.current?.focus(); syncEditor() }

  // Cover generation
  async function generateCover() {
    if (!article?.title.trim()) return
    setGenCover(true); setCoverOptions([])
    try {
      const res = await fetch('/api/articles/cover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: article.title, description: article.subtitle }),
      })
      const data = await res.json()
      if (data.urls?.length) { setCoverOptions(data.urls); updateLocal({ cover_url: data.urls[0] }) }
    } finally { setGenCover(false) }
  }

  // Publish to blog
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

  // Create email from article
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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <Link href="/articles" className="p-1.5 text-dim hover:text-muted"><ArrowLeft className="w-4 h-4" /></Link>
        <span className="text-sm font-medium text-cream truncate max-w-[200px]">{article.title || 'Новая статья'}</span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${article.status === 'published' ? 'bg-green-500/10 text-green-400' : 'bg-white/5 text-dim'}`}>
          {article.status === 'published' ? 'Опубликовано' : 'Черновик'}
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
        <button onClick={handleSave} disabled={saving}
          className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream disabled:opacity-50 flex items-center gap-1.5">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} Сохранить
        </button>
        <button onClick={handlePublish} disabled={publishing || !article.blog_slug}
          className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs hover:bg-accent/90 disabled:opacity-50 flex items-center gap-1.5">
          {publishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Globe className="w-3 h-3" />} Опубликовать
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Main content */}
        <div className="flex-1 min-w-0 border-r border-border flex flex-col">
          {tab === 'edit' && (<>
            {/* Meta fields */}
            <div className="p-4 border-b border-border space-y-3">
              <input placeholder="Заголовок статьи" value={article.title}
                onChange={e => updateLocal({ title: e.target.value })}
                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-sm font-medium text-cream focus:outline-none focus:border-accent" />
              <input placeholder="Подзаголовок / интрига" value={article.subtitle}
                onChange={e => updateLocal({ subtitle: e.target.value })}
                className="w-full px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-muted focus:outline-none focus:border-accent" />
              <div className="flex gap-3">
                <div className="flex-1">
                  <div className="flex gap-2">
                    <input placeholder="URL обложки" value={article.cover_url ?? ''} onChange={e => updateLocal({ cover_url: e.target.value })}
                      className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent" />
                    <button onClick={generateCover} disabled={genCover || !article.title.trim()}
                      className="px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs hover:bg-accent/20 disabled:opacity-50 flex items-center gap-1.5">
                      {genCover ? <Loader2 className="w-3 h-3 animate-spin" /> : <Image className="w-3 h-3" />} Обложка
                    </button>
                  </div>
                  {coverOptions.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {coverOptions.map((url, i) => (
                        <button key={i} onClick={() => updateLocal({ cover_url: url })}
                          className={`rounded-lg overflow-hidden border-2 ${article.cover_url === url ? 'border-accent' : 'border-border'}`}>
                          <img src={url} className="w-32 h-20 object-cover" alt="" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input placeholder="YouTube URL" value={article.youtube_url ?? ''} onChange={e => updateLocal({ youtube_url: e.target.value })}
                  className="w-64 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent" />
              </div>
              {article.cover_url && <img src={article.cover_url} className="w-full h-48 object-cover rounded-lg" alt="" />}
              <select value={article.category ?? ''} onChange={e => updateLocal({ category: e.target.value || null })}
                className="px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-muted focus:outline-none focus:border-accent">
                <option value="">Категория</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Toolbar */}
            <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border/50">
              {[
                { icon: Bold, cmd: () => execCmd('bold') },
                { icon: Italic, cmd: () => execCmd('italic') },
                { icon: Heading2, cmd: () => execCmd('formatBlock', 'h2') },
                { icon: Quote, cmd: () => execCmd('formatBlock', 'blockquote') },
                { icon: Link2, cmd: () => { const u = prompt('URL:'); if (u) execCmd('createLink', u) } },
                { icon: Minus, cmd: () => execCmd('insertHTML', '<hr class="divider">') },
              ].map(({ icon: Icon, cmd }, i) => (
                <button key={i} onClick={cmd} className="p-1.5 text-dim hover:text-cream hover:bg-white/5 rounded">
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
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
            <div className="flex-1 overflow-y-auto">
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
                    [&_hr]:border-border [&_hr]:my-6 [&_strong]:text-cream [&_a]:text-accent"
                  dangerouslySetInnerHTML={{ __html: article.body_html || '<p style="color:#555">Начните писать статью...</p>' }}
                  onBlur={syncEditor} />
              ) : (
                <div className="p-6 flex justify-center">
                  <div className={`bg-black rounded-lg shadow-lg overflow-hidden ${preview === 'mobile' ? 'w-[375px]' : 'w-[680px]'}`}>
                    <iframe srcDoc={`<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;color:#e8e8e8;font-family:'Lora',Georgia,serif;font-size:19px;line-height:1.75;-webkit-font-smoothing:antialiased}.w{max-width:680px;margin:0 auto;padding:48px 24px}h1{font-size:36px;font-weight:400;line-height:1.25;margin-bottom:12px}h2{font-family:'Inter',sans-serif;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin:48px 0 16px;color:#e8e8e8}p{margin-bottom:1.4em}blockquote{border-left:3px solid #1a4fff;padding:4px 0 4px 20px;margin:24px 0;font-style:italic;color:#888}blockquote cite{display:block;margin-top:8px;font-style:normal;font-size:14px;font-family:'Inter',sans-serif;color:#555}strong{color:#fff}a{color:#888}.sub{font-style:italic;font-size:18px;color:#888;margin-bottom:40px}.insight{border-left:3px solid #1a4fff;padding:4px 0 4px 20px;margin:32px 0}.ins-label{font-family:'Inter',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#1a4fff;margin-bottom:6px}.ins-text{font-style:italic;font-size:19px;line-height:1.5}.qblock{border-top:1px solid #1a1a1a;border-bottom:1px solid #1a1a1a;padding:28px 0;margin:40px 0}.q-label{font-family:'Inter',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#555;margin-bottom:10px}.q-text{font-style:italic;font-size:22px;line-height:1.4}hr{border:none;border-top:1px solid #1a1a1a;margin:24px 0}img.cover{width:100%;border-radius:8px;margin-bottom:40px}.video{position:relative;padding-bottom:56.25%;height:0;margin:32px 0;border-radius:8px;overflow:hidden}.video iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0}</style><link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;600&display=swap" rel="stylesheet"><div class="w">${article.cover_url ? `<img class="cover" src="${article.cover_url}">` : ''}<h1>${article.title || 'Заголовок'}</h1><p class="sub">${article.subtitle || ''}</p>${ytId ? `<div class="video"><iframe src="https://www.youtube.com/embed/${ytId}" allowfullscreen></iframe></div>` : ''}${article.body_html || ''}</div>`}
                      className="w-full border-0" style={{ height: '80vh' }} />
                  </div>
                </div>
              )}
            </div>
          </>)}

          {tab === 'seo' && (
            <div className="p-6 space-y-5 overflow-y-auto">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-cream flex items-center gap-2"><Globe className="w-4 h-4 text-accent" /> SEO и публикация</h2>
                <button onClick={async () => {
                  const textOnly = article.body_html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 2000)
                  setChatLoading(true)
                  const res = await fetch('/api/articles/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ article_id: id, message: `Сгенерируй SEO для статьи «Личная Стратегия». Тема: "${article.title}"\nТекст: ${textOnly}\nJSON формат: {"seo_title":"до 60 символов","seo_description":"до 160 символов, CTA","seo_keywords":["ключ1","ключ2"],"blog_slug":"slug-na-latinitse","category":"одна из: ${CATEGORIES.join(', ')}","tags":["тег1","тег2"]}` }) })
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
            <div className="p-6 space-y-4 overflow-y-auto">
              <h2 className="text-sm font-medium text-cream mb-4">Дистрибуция из статьи</h2>

              {/* Email */}
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

              {/* YouTube script — placeholder */}
              <div className="p-4 bg-surface border border-border rounded-xl opacity-60">
                <div className="flex items-center gap-2"><Play className="w-4 h-4 text-red-400" /><span className="text-xs font-medium text-cream">Сценарий для YouTube</span></div>
                <p className="text-[11px] text-dim mt-2">Скоро: генерация сценария для видео из статьи</p>
              </div>

              {/* Carousel — placeholder */}
              <div className="p-4 bg-surface border border-border rounded-xl opacity-60">
                <div className="flex items-center gap-2"><Image className="w-4 h-4 text-purple-400" /><span className="text-xs font-medium text-cream">Карусель</span></div>
                <p className="text-[11px] text-dim mt-2">Скоро: генерация карусели для Instagram/Telegram</p>
              </div>

              {/* Threads — placeholder */}
              <div className="p-4 bg-surface border border-border rounded-xl opacity-60">
                <div className="flex items-center gap-2"><Send className="w-4 h-4 text-gray-400" /><span className="text-xs font-medium text-cream">Threads</span></div>
                <p className="text-[11px] text-dim mt-2">Скоро: генерация тредов из ключевых мыслей</p>
              </div>
            </div>
          )}
        </div>

        {/* AI Chat sidebar */}
        <div className="w-[360px] shrink-0 flex flex-col">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-accent" /><span className="text-xs font-medium text-cream">AI-ассистент</span>
          </div>
          <div className="px-3 py-2 border-b border-border/50 flex flex-wrap gap-1">
            {QUICK_CMDS.map(c => (
              <button key={c.label} onClick={() => sendChat(c.prompt)} disabled={chatLoading}
                className="px-2.5 py-1 bg-surface border border-border rounded-full text-[10px] text-muted hover:text-cream hover:border-accent/50 disabled:opacity-50">{c.label}</button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.length === 0 && <div className="text-center py-8"><Sparkles className="w-8 h-8 text-dim mx-auto mb-3" /><p className="text-xs text-dim">Спроси что-нибудь или используй быстрые команды</p></div>}
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
          <div className="p-3 border-t border-border flex gap-2">
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
    </div>
  )
}
