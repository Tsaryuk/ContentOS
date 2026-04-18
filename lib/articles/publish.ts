// Publishes/updates a static HTML article on letters.tsaryuk.ru.
// Remote storage is reached via SFTP (reg.ru shared hosting). The HTML
// template is still loaded from the local repo checkout on the VPS where
// ContentOS runs.

import { readFileSync, existsSync } from 'fs'
import { join, posix } from 'path'
import Client from 'ssh2-sftp-client'
import { sanitizeArticleHtml } from '@/lib/sanitize'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,100}$/

function assertSafeSlug(slug: string, label = 'blog_slug'): void {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`${label} invalid — allowed: lowercase letters, digits, hyphens`)
  }
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

interface IndexEntry {
  slug: string
  title: string
  date: string
  category: string | null
  cover: string | null
}

interface SftpConfig {
  host: string
  port: number
  username: string
  password: string
  remoteDir: string
}

function loadSftpConfig(): SftpConfig {
  const host = process.env.LETTERS_SFTP_HOST
  const user = process.env.LETTERS_SFTP_USER
  const password = process.env.LETTERS_SFTP_PASSWORD
  const remoteDir = process.env.LETTERS_SFTP_REMOTE_DIR
  if (!host || !user || !password || !remoteDir) {
    throw new Error(
      'SFTP не настроен — задай LETTERS_SFTP_HOST / USER / PASSWORD / REMOTE_DIR',
    )
  }
  const port = Number(process.env.LETTERS_SFTP_PORT ?? '22')
  return { host, port, username: user, password, remoteDir }
}

async function withSftp<T>(fn: (sftp: Client, cfg: SftpConfig) => Promise<T>): Promise<T> {
  const cfg = loadSftpConfig()
  const sftp = new Client()
  await sftp.connect({
    host: cfg.host,
    port: cfg.port,
    username: cfg.username,
    password: cfg.password,
    readyTimeout: 15_000,
  })
  try {
    return await fn(sftp, cfg)
  } finally {
    try {
      await sftp.end()
    } catch {
      // ignore
    }
  }
}

function remotePath(cfg: SftpConfig, ...segments: string[]): string {
  return posix.join(cfg.remoteDir, ...segments)
}

function remoteArticlePath(cfg: SftpConfig, slug: string): string {
  assertSafeSlug(slug)
  return remotePath(cfg, 'articles', `${slug}.html`)
}

async function readRemoteJson<T>(sftp: Client, path: string, fallback: T): Promise<T> {
  try {
    const buf = await sftp.get(path)
    const text = Buffer.isBuffer(buf) ? buf.toString('utf-8') : String(buf)
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

async function writeRemoteString(sftp: Client, path: string, content: string): Promise<void> {
  await sftp.put(Buffer.from(content, 'utf-8'), path)
}

function renderArticleHtml(article: Article): string {
  const templatePath = join(process.cwd(), 'services/letters-site/article-template.html')
  if (!existsSync(templatePath)) {
    throw new Error('Шаблон статьи не найден: ' + templatePath)
  }
  const template = readFileSync(templatePath, 'utf-8')

  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : new Date().toLocaleDateString('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric',
      })

  const showCover = article.show_cover_in_article !== false
  const coverImg = showCover && article.cover_url
    ? `<img class="article-cover" src="${article.cover_url}" alt="${article.title.replace(/"/g, '&quot;')}">`
    : ''

  const safeBodyHtml = sanitizeArticleHtml(article.body_html)

  return template
    .replace(/\{\{TITLE\}\}/g, article.title)
    .replace(/\{\{DESCRIPTION\}\}/g, article.seo_description || article.subtitle)
    .replace(/\{\{SUBTITLE\}\}/g, article.subtitle || '')
    .replace(/\{\{COVER_URL\}\}/g, article.cover_url || '')
    .replace(/\{\{COVER_IMG\}\}/g, coverImg)
    .replace(/\{\{CATEGORY\}\}/g, article.category || '')
    .replace(/\{\{DATE\}\}/g, date)
    .replace(/\{\{NUMBER\}\}/g, '')
    .replace(/\{\{SLUG\}\}/g, article.blog_slug || '')
    .replace(/\{\{BODY_HTML\}\}/g, safeBodyHtml)
}

export async function publishArticleFiles(
  article: Article,
  opts: { previousSlug?: string | null } = {},
): Promise<{ url: string }> {
  if (!article.blog_slug) throw new Error('blog_slug обязателен')
  if (!article.body_html?.trim()) throw new Error('Статья пустая')
  assertSafeSlug(article.blog_slug)

  const html = renderArticleHtml(article)
  const prev = opts.previousSlug

  await withSftp(async (sftp, cfg) => {
    const articlesDir = remotePath(cfg, 'articles')
    if (!(await sftp.exists(articlesDir))) {
      await sftp.mkdir(articlesDir, true)
    }

    const htmlPath = remoteArticlePath(cfg, article.blog_slug!)
    await writeRemoteString(sftp, htmlPath, html)

    if (prev && prev !== article.blog_slug) {
      try {
        const oldPath = remoteArticlePath(cfg, prev)
        if (await sftp.exists(oldPath)) {
          await sftp.delete(oldPath)
        }
      } catch {
        // previous slug invalid — skip cleanup
      }
    }

    const indexPath = remotePath(cfg, 'articles', 'index.json')
    const articles = await readRemoteJson<IndexEntry[]>(sftp, indexPath, [])

    const date = article.published_at
      ? new Date(article.published_at).toLocaleDateString('ru-RU', {
          day: 'numeric', month: 'long', year: 'numeric',
        })
      : new Date().toLocaleDateString('ru-RU', {
          day: 'numeric', month: 'long', year: 'numeric',
        })

    const filtered = articles.filter(
      (a) => a.slug !== article.blog_slug && a.slug !== prev,
    )
    filtered.unshift({
      slug: article.blog_slug!,
      title: article.title,
      date,
      category: article.category || null,
      cover: article.cover_url || null,
    })

    await writeRemoteString(sftp, indexPath, JSON.stringify(filtered, null, 2))
  })

  return { url: `https://letters.tsaryuk.ru/articles/${article.blog_slug}.html` }
}

export async function unpublishArticleFiles(slug: string): Promise<void> {
  assertSafeSlug(slug)

  await withSftp(async (sftp, cfg) => {
    const htmlPath = remoteArticlePath(cfg, slug)
    if (await sftp.exists(htmlPath)) {
      try {
        await sftp.delete(htmlPath)
      } catch {
        // ignore
      }
    }

    const indexPath = remotePath(cfg, 'articles', 'index.json')
    const articles = await readRemoteJson<IndexEntry[]>(sftp, indexPath, [])
    const filtered = articles.filter((a) => a.slug !== slug)
    if (filtered.length !== articles.length) {
      await writeRemoteString(sftp, indexPath, JSON.stringify(filtered, null, 2))
    }
  })
}
