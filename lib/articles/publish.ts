// Publishes/updates a static HTML article on letters.tsaryuk.ru
// Called from publish route (first-time) and auto-republish on save

import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from 'fs'
import { join, resolve } from 'path'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,100}$/

function assertSafeSlug(slug: string, label = 'blog_slug'): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`${label} invalid — allowed: lowercase letters, digits, hyphens`)
  }
}

function safeJoinArticle(slug: string): string {
  assertSafeSlug(slug)
  const filePath = join(ARTICLES_DIR, `${slug}.html`)
  const resolved = resolve(filePath)
  if (!resolved.startsWith(resolve(ARTICLES_DIR) + '/')) {
    throw new Error('path traversal detected')
  }
  return resolved
}

interface Article {
  id: string
  title: string
  subtitle: string
  body_html: string
  cover_url: string | null
  youtube_url: string | null
  category: string | null
  seo_title: string
  seo_description: string
  blog_slug: string | null
  published_at: string | null
  show_cover_in_article?: boolean
}

const ARTICLES_DIR = '/var/www/letters/articles'
const INDEX_JSON = `${ARTICLES_DIR}/index.json`

interface IndexEntry {
  slug: string
  title: string
  date: string
  category: string | null
  cover: string | null
}

export async function publishArticleFiles(
  article: Article,
  opts: { previousSlug?: string | null } = {}
): Promise<{ url: string }> {
  if (!article.blog_slug) throw new Error('blog_slug обязателен')
  if (!article.body_html?.trim()) throw new Error('Статья пустая')

  // Read template
  const templatePath = join(process.cwd(), 'services/letters-site/article-template.html')
  if (!existsSync(templatePath)) {
    throw new Error('Шаблон статьи не найден')
  }
  const template = readFileSync(templatePath, 'utf-8')

  // Use published_at date or today
  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : new Date().toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric',
      })

  // Cover image in body — only if toggle enabled (default true for backwards compat)
  const showCover = article.show_cover_in_article !== false
  const coverImg = showCover && article.cover_url
    ? `<img class="article-cover" src="${article.cover_url}" alt="${article.title.replace(/"/g, '&quot;')}">`
    : ''

  // Body already contains YouTube embed if inserted via editor; don't duplicate
  const html = template
    .replace(/\{\{TITLE\}\}/g, article.title)
    .replace(/\{\{DESCRIPTION\}\}/g, article.seo_description || article.subtitle)
    .replace(/\{\{SUBTITLE\}\}/g, article.subtitle || '')
    .replace(/\{\{COVER_URL\}\}/g, article.cover_url || '')
    .replace(/\{\{COVER_IMG\}\}/g, coverImg)
    .replace(/\{\{CATEGORY\}\}/g, article.category || '')
    .replace(/\{\{DATE\}\}/g, date)
    .replace(/\{\{NUMBER\}\}/g, '')
    .replace(/\{\{SLUG\}\}/g, article.blog_slug || '')
    .replace(/\{\{BODY_HTML\}\}/g, article.body_html)

  // Only write on server (not dev machine)
  if (!existsSync('/var/www/letters')) {
    throw new Error('Запись возможна только на сервере (/var/www/letters не существует)')
  }

  if (!existsSync(ARTICLES_DIR)) mkdirSync(ARTICLES_DIR, { recursive: true })
  const filePath = safeJoinArticle(article.blog_slug)
  writeFileSync(filePath, html, 'utf-8')

  // Remove old HTML file if slug changed
  const prev = opts.previousSlug
  if (prev && prev !== article.blog_slug) {
    try {
      const oldPath = safeJoinArticle(prev)
      if (existsSync(oldPath)) {
        try { unlinkSync(oldPath) } catch { /* ignore */ }
      }
    } catch { /* invalid previous slug — skip cleanup */ }
  }

  // Update articles/index.json
  let articles: IndexEntry[] = []
  if (existsSync(INDEX_JSON)) {
    try {
      articles = JSON.parse(readFileSync(INDEX_JSON, 'utf-8'))
    } catch {
      articles = []
    }
  }

  // Remove current slug AND previous slug (if different) from index
  articles = articles.filter(a => a.slug !== article.blog_slug && a.slug !== prev)
  articles.unshift({
    slug: article.blog_slug,
    title: article.title,
    date,
    category: article.category || null,
    cover: article.cover_url || null,
  })

  writeFileSync(INDEX_JSON, JSON.stringify(articles, null, 2), 'utf-8')

  return { url: `https://letters.tsaryuk.ru/articles/${article.blog_slug}.html` }
}

// Remove published article: delete HTML file + index entry
export async function unpublishArticleFiles(slug: string): Promise<void> {
  if (!existsSync('/var/www/letters')) return

  let filePath: string
  try {
    filePath = safeJoinArticle(slug)
  } catch {
    return
  }
  if (existsSync(filePath)) {
    try { unlinkSync(filePath) } catch { /* ignore */ }
  }

  if (existsSync(INDEX_JSON)) {
    try {
      const articles: IndexEntry[] = JSON.parse(readFileSync(INDEX_JSON, 'utf-8'))
      const filtered = articles.filter(a => a.slug !== slug)
      writeFileSync(INDEX_JSON, JSON.stringify(filtered, null, 2), 'utf-8')
    } catch {
      /* ignore */
    }
  }
}
