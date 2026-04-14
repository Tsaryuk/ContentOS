'use client'

import { useState } from 'react'
import { Loader2, Sparkles, Globe, Tag, Image, Copy, Check } from 'lucide-react'

interface SeoPanelProps {
  seoTitle: string
  seoDescription: string
  seoKeywords: string[]
  blogSlug: string
  ogImageUrl: string
  category: string
  tags: string[]
  subject: string
  articleHtml: string
  onUpdate: (fields: Record<string, any>) => void
}

const CATEGORIES = ['Мышление', 'Деньги', 'Отношения', 'Стратегия', 'AI', 'Путешествия']

export function SeoPanel({
  seoTitle, seoDescription, seoKeywords, blogSlug, ogImageUrl,
  category, tags, subject, articleHtml, onUpdate,
}: SeoPanelProps) {
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  async function generateSeo() {
    setGenerating(true)
    try {
      const textOnly = articleHtml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 2000)
      const res = await fetch('/api/newsletter/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Сгенерируй SEO для статьи рассылки. Тема: "${subject}"

Текст статьи (фрагмент): ${textOnly}

Ответь строго в формате JSON (без markdown):
{
  "seo_title": "SEO заголовок (до 60 символов, с ключевым словом в начале)",
  "seo_description": "Мета-описание (до 160 символов, с CTA)",
  "seo_keywords": ["ключ1", "ключ2", "ключ3", "ключ4", "ключ5"],
  "blog_slug": "url-slug-na-latinitse",
  "category": "одна из: Мышление, Деньги, Отношения, Стратегия, AI, Путешествия",
  "tags": ["тег1", "тег2", "тег3"]
}`,
        }),
      })
      const data = await res.json()
      if (data.content) {
        try {
          const clean = data.content.replace(/```json\n?|```\n?/g, '').trim()
          const parsed = JSON.parse(clean)
          onUpdate({
            seo_title: parsed.seo_title ?? '',
            seo_description: parsed.seo_description ?? '',
            seo_keywords: parsed.seo_keywords ?? [],
            blog_slug: parsed.blog_slug ?? '',
            category: parsed.category ?? '',
            tags: parsed.tags ?? [],
          })
        } catch {
          // If not valid JSON, just show raw
          onUpdate({ seo_description: data.content })
        }
      }
    } finally {
      setGenerating(false)
    }
  }

  function slugFromTitle() {
    const slug = subject
      .toLowerCase()
      .replace(/[а-яё]/g, (c) => {
        const map: Record<string, string> = {
          'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i',
          'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
          'у':'u','ф':'f','х':'h','ц':'ts','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'',
          'э':'e','ю':'yu','я':'ya'
        }
        return map[c] ?? c
      })
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    onUpdate({ blog_slug: slug })
  }

  const articleUrl = blogSlug ? `https://letters.tsaryuk.ru/articles/${blogSlug}.html` : ''

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-accent" />
            <span className="text-sm font-medium text-cream">SEO и публикация</span>
          </div>
          <button
            onClick={generateSeo}
            disabled={generating}
            className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs hover:bg-accent/90 disabled:opacity-50 flex items-center gap-1.5"
          >
            {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            AI-генерация SEO
          </button>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* SEO Title */}
        <div>
          <label className="text-[10px] text-dim uppercase tracking-wider mb-1.5 block">
            SEO Title <span className="text-dim/50">({seoTitle.length}/60)</span>
          </label>
          <input
            value={seoTitle}
            onChange={e => onUpdate({ seo_title: e.target.value })}
            placeholder="SEO заголовок страницы"
            maxLength={70}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent"
          />
        </div>

        {/* SEO Description */}
        <div>
          <label className="text-[10px] text-dim uppercase tracking-wider mb-1.5 block">
            Meta Description <span className="text-dim/50">({seoDescription.length}/160)</span>
          </label>
          <textarea
            value={seoDescription}
            onChange={e => onUpdate({ seo_description: e.target.value })}
            placeholder="Мета-описание для поисковиков"
            maxLength={170}
            rows={3}
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent resize-none"
          />
        </div>

        {/* Slug */}
        <div>
          <label className="text-[10px] text-dim uppercase tracking-wider mb-1.5 block">URL (slug)</label>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center bg-surface border border-border rounded-lg overflow-hidden">
              <span className="px-3 text-[10px] text-dim whitespace-nowrap">/articles/</span>
              <input
                value={blogSlug}
                onChange={e => onUpdate({ blog_slug: e.target.value })}
                placeholder="url-slug"
                className="flex-1 px-1 py-2 bg-transparent text-xs text-cream focus:outline-none"
              />
              <span className="px-2 text-[10px] text-dim">.html</span>
            </div>
            <button
              onClick={slugFromTitle}
              className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream"
              title="Сгенерировать из заголовка"
            >
              Auto
            </button>
          </div>
          {articleUrl && (
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[10px] text-dim truncate">{articleUrl}</span>
              <button
                onClick={() => { navigator.clipboard.writeText(articleUrl); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                className="text-dim hover:text-muted"
              >
                {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
          )}
        </div>

        {/* Keywords */}
        <div>
          <label className="text-[10px] text-dim uppercase tracking-wider mb-1.5 block">Ключевые слова</label>
          <input
            value={seoKeywords.join(', ')}
            onChange={e => onUpdate({ seo_keywords: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
            placeholder="ключ1, ключ2, ключ3"
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent"
          />
        </div>

        {/* Category */}
        <div>
          <label className="text-[10px] text-dim uppercase tracking-wider mb-1.5 block">Рубрика</label>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(c => (
              <button
                key={c}
                onClick={() => onUpdate({ category: c })}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  category === c
                    ? 'bg-accent/10 border-accent text-accent'
                    : 'border-border text-dim hover:text-muted hover:border-muted'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="text-[10px] text-dim uppercase tracking-wider mb-1.5 block">Теги</label>
          <input
            value={tags.join(', ')}
            onChange={e => onUpdate({ tags: e.target.value.split(',').map((s: string) => s.trim()).filter(Boolean) })}
            placeholder="тег1, тег2, тег3"
            className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent"
          />
        </div>

        {/* OG Image */}
        <div>
          <label className="text-[10px] text-dim uppercase tracking-wider mb-1.5 block">OG Image</label>
          <div className="flex gap-2">
            <input
              value={ogImageUrl ?? ''}
              onChange={e => onUpdate({ og_image_url: e.target.value })}
              placeholder="URL для Open Graph (обычно = обложка)"
              className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent"
            />
            <button
              onClick={() => onUpdate({ og_image_url: ogImageUrl || '' })}
              className="px-3 py-1.5 border border-border rounded-lg text-xs text-muted hover:text-cream flex items-center gap-1.5"
            >
              <Image className="w-3 h-3" />
              = Обложка
            </button>
          </div>
        </div>

        {/* Preview */}
        <div>
          <label className="text-[10px] text-dim uppercase tracking-wider mb-3 block">Превью в поиске</label>
          <div className="p-4 bg-white rounded-lg">
            <div className="text-[11px] text-green-700 mb-0.5">
              letters.tsaryuk.ru &rsaquo; articles &rsaquo; {blogSlug || 'slug'}
            </div>
            <div className="text-base text-blue-700 font-medium mb-1 leading-tight">
              {seoTitle || subject || 'Заголовок страницы'}
            </div>
            <div className="text-xs text-gray-600 leading-relaxed">
              {seoDescription || 'Мета-описание будет отображаться здесь...'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
