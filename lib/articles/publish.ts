// Publishes/updates a static HTML article on letters.tsaryuk.ru
// Called from publish route (first-time) and auto-republish on save

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

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

export async function publishArticleFiles(article: Article): Promise<{ url: string }> {
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

  // Body already contains YouTube embed if inserted via editor; don't duplicate
  const html = template
    .replace(/\{\{TITLE\}\}/g, article.title)
    .replace(/\{\{DESCRIPTION\}\}/g, article.seo_description || article.subtitle)
    .replace(/\{\{COVER_URL\}\}/g, article.cover_url || '')
    .replace(/\{\{CATEGORY\}\}/g, article.category || '')
    .replace(/\{\{DATE\}\}/g, date)
    .replace(/\{\{NUMBER\}\}/g, '')
    .replace(/\{\{BODY_HTML\}\}/g, article.body_html)

  // Only write on server (not dev machine)
  if (!existsSync('/var/www/letters')) {
    throw new Error('Запись возможна только на сервере (/var/www/letters не существует)')
  }

  if (!existsSync(ARTICLES_DIR)) mkdirSync(ARTICLES_DIR, { recursive: true })
  const filePath = join(ARTICLES_DIR, `${article.blog_slug}.html`)
  writeFileSync(filePath, html, 'utf-8')

  // Update articles/index.json
  let articles: IndexEntry[] = []
  if (existsSync(INDEX_JSON)) {
    try {
      articles = JSON.parse(readFileSync(INDEX_JSON, 'utf-8'))
    } catch {
      articles = []
    }
  }

  articles = articles.filter(a => a.slug !== article.blog_slug)
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
