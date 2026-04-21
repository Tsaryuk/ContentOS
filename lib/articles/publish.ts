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

function formatDateRu(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

interface ArticlePayload {
  slug: string
  title: string
  subtitle: string
  description: string
  category: string
  date: string
  cover_url: string
  show_cover_in_article: boolean
  body_html: string
  published_at: string | null
}

// Build the per-article JSON that /article.php on the hosting reads and
// renders inside the central shell. body_html goes through sanitizeArticleHtml
// here, before it ever leaves the server — PHP trusts the field.
function buildArticlePayload(article: Article): ArticlePayload {
  return {
    slug: article.blog_slug!,
    title: article.title,
    subtitle: article.subtitle ?? '',
    description: article.seo_description || article.subtitle || '',
    category: article.category ?? '',
    date: formatDateRu(article.published_at),
    cover_url: article.cover_url ?? '',
    show_cover_in_article: article.show_cover_in_article !== false,
    body_html: sanitizeArticleHtml(article.body_html),
    published_at: article.published_at,
  }
}

function remoteArticleJsonPath(cfg: SftpConfig, slug: string): string {
  assertSafeSlug(slug)
  return remotePath(cfg, 'articles', `${slug}.json`)
}

export async function publishArticleFiles(
  article: Article,
  opts: { previousSlug?: string | null } = {},
): Promise<{ url: string }> {
  if (!article.blog_slug) throw new Error('blog_slug обязателен')
  if (!article.body_html?.trim()) throw new Error('Статья пустая')
  assertSafeSlug(article.blog_slug)

  const payload = buildArticlePayload(article)
  const prev = opts.previousSlug

  await withSftp(async (sftp, cfg) => {
    const articlesDir = remotePath(cfg, 'articles')
    if (!(await sftp.exists(articlesDir))) {
      await sftp.mkdir(articlesDir, true)
    }

    // New-shape: single JSON per article. /article.php + .htaccess rewrite
    // turn this into a real page. No per-article HTML is uploaded anymore —
    // editing the shell in article.php applies to everyone without republish.
    const jsonPath = remoteArticleJsonPath(cfg, article.blog_slug!)
    await writeRemoteString(sftp, jsonPath, JSON.stringify(payload, null, 2))

    // Clean up old artifacts for the current slug: any pre-migration .html
    // would otherwise short-circuit the rewrite (Apache matches filesystem
    // file before the JSON-based rule because .html is served directly).
    // Delete it so the canonical path goes through PHP.
    const htmlPath = remoteArticlePath(cfg, article.blog_slug!)
    if (await sftp.exists(htmlPath)) {
      try { await sftp.delete(htmlPath) } catch { /* ignore */ }
    }

    // If the slug was renamed, also remove both artifacts under the old slug.
    if (prev && prev !== article.blog_slug) {
      for (const remove of [remoteArticlePath(cfg, prev), remoteArticleJsonPath(cfg, prev)]) {
        try {
          if (await sftp.exists(remove)) await sftp.delete(remove)
        } catch { /* previous slug invalid — skip cleanup */ }
      }
    }

    const indexPath = remotePath(cfg, 'articles', 'index.json')
    const articles = await readRemoteJson<IndexEntry[]>(sftp, indexPath, [])

    const filtered = articles.filter(
      (a) => a.slug !== article.blog_slug && a.slug !== prev,
    )
    filtered.unshift({
      slug: article.blog_slug!,
      title: article.title,
      date: payload.date,
      category: article.category || null,
      cover: article.cover_url || null,
    })

    await writeRemoteString(sftp, indexPath, JSON.stringify(filtered, null, 2))

    // Bootstrap the shell files: .htaccess rewrite rules + article.php
    // renderer. Overwriting them on every publish keeps the hosting in sync
    // with the repo so you don't need a separate "deploy letters-site" flow.
    await syncSiteAssets(sftp, cfg)
  })

  return { url: `https://letters.tsaryuk.ru/articles/${article.blog_slug}` }
}

// Upload site-wide static files (.htaccess, article.php) that aren't tied to
// a single article. Failures are swallowed — the article upload itself
// already succeeded and we don't want a shell-sync hiccup to fail the
// publish.
async function syncSiteAssets(sftp: Client, cfg: SftpConfig): Promise<void> {
  // Keep these remote paths aligned with repo paths so the hosting is a
  // mirror of services/letters-site/ after any publish. When you edit the
  // CSS or the shell PHP, the next publish syncs the change.
  const assets: Array<{ local: string; remote: string }> = [
    {
      local: join(process.cwd(), 'services/letters-site/.htaccess'),
      remote: remotePath(cfg, '.htaccess'),
    },
    {
      local: join(process.cwd(), 'services/letters-site/article.php'),
      remote: remotePath(cfg, 'article.php'),
    },
    {
      local: join(process.cwd(), 'services/letters-site/assets/article.css'),
      remote: remotePath(cfg, 'assets', 'article.css'),
    },
    {
      local: join(process.cwd(), 'services/letters-site/assets/article.js'),
      remote: remotePath(cfg, 'assets', 'article.js'),
    },
  ]
  for (const { local, remote } of assets) {
    try {
      if (!existsSync(local)) continue
      const content = readFileSync(local, 'utf-8')
      await writeRemoteString(sftp, remote, content)
    } catch {
      // shell sync is best-effort; logs elsewhere
    }
  }
}

export async function unpublishArticleFiles(slug: string): Promise<void> {
  assertSafeSlug(slug)

  await withSftp(async (sftp, cfg) => {
    // Remove both legacy .html (if any) and the new .json payload for this
    // slug so neither Apache nor article.php can still serve the article.
    for (const path of [remoteArticlePath(cfg, slug), remoteArticleJsonPath(cfg, slug)]) {
      try {
        if (await sftp.exists(path)) await sftp.delete(path)
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
