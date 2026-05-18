// Publishes/updates a static HTML article on letters.tsaryuk.ru.
// Remote storage is reached via SFTP (reg.ru shared hosting). The HTML
// template is still loaded from the local repo checkout on the VPS where
// ContentOS runs.

import { readFileSync, existsSync } from 'fs'
import { join, posix } from 'path'
import Client from 'ssh2-sftp-client'
import { sanitizeArticleHtml } from '@/lib/sanitize'
import { supabaseAdmin } from '@/lib/supabase'
import { logger } from '@/lib/logger'

const log = logger.child({ module: 'articles/publish' })

/**
 * Retry an SFTP call on transient network failures. ssh2-sftp-client throws
 * generic Errors with messages like "Connection lost" / "Channel closed" —
 * we treat those as retryable. Anything else (e.g. permission denied) is
 * a real failure and surfaces immediately.
 */
async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const msg = err instanceof Error ? err.message : String(err)
      const transient = /lost|closed|reset|timeout|ECONN|EAI_AGAIN/i.test(msg)
      log.warn({ label, attempt: i, attempts, err: msg, transient }, 'sftp call failed')
      if (!transient || i === attempts) break
      await new Promise((r) => setTimeout(r, 250 * 2 ** (i - 1)))
    }
  }
  throw lastErr
}

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
  tags?: string[] | null
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
  /** ISO timestamp used for sorting the index. The human `date` above
   *  ("18 мая 2026 г.") isn't sortable, so we persist the raw value too. */
  published_at: string | null
  category: string | null
  /** Secondary rubrics (multi-select). `category` mirrors tags[0] for
   *  backward compat with older filters that only look at `category`. */
  tags?: string[]
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

async function writeRemoteString(sftp: Client, path: string, content: string): Promise<void> {
  await withRetry(`put ${path}`, () => sftp.put(Buffer.from(content, 'utf-8'), path))
}

function formatDateRu(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

/**
 * Reads every currently-published article from the DB and projects it to the
 * shape that letters.tsaryuk.ru's index.html / archive.html consume.
 * Sorted by published_at desc — newest first. Articles without published_at
 * (legacy rows) fall through to the bottom.
 */
async function buildIndexFromDb(): Promise<IndexEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('nl_articles')
    .select('blog_slug, title, published_at, category, tags, cover_url')
    .eq('status', 'published')
    .not('blog_slug', 'is', null)
    .order('published_at', { ascending: false, nullsFirst: false })
  if (error) throw error
  return (data ?? []).map((a): IndexEntry => ({
    slug: a.blog_slug as string,
    title: (a.title as string) ?? '',
    date: formatDateRu(a.published_at as string | null),
    published_at: (a.published_at as string | null) ?? null,
    category: (a.category as string | null) ?? null,
    tags: Array.isArray(a.tags) ? (a.tags as string[]) : [],
    cover: (a.cover_url as string | null) ?? null,
  }))
}

interface ArticlePayload {
  slug: string
  title: string
  subtitle: string
  description: string
  category: string
  /** Multi-select rubrics chosen in the editor. `category` is kept as the
   *  first element for backward compat with the static blog that used to
   *  filter by a single field. */
  tags: string[]
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
  const tags = (article.tags ?? []).filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
  return {
    slug: article.blog_slug!,
    title: article.title,
    subtitle: article.subtitle ?? '',
    description: article.seo_description || article.subtitle || '',
    category: article.category ?? tags[0] ?? '',
    tags,
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
  const startedAt = Date.now()
  log.info({ articleId: article.id, slug: article.blog_slug, previousSlug: prev }, 'publish started')

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

    // Rebuild the public index.json from the database on every publish
    // instead of patching whatever is currently on reg.ru. The DB is the
    // source of truth; the remote file is just a cached projection. This
    // means:
    //   - chronological order is always correct (sorted by published_at desc)
    //   - renaming a slug, retracting a status, or deleting a row reflects
    //     immediately
    //   - the local "unshift then sort" dance can't drift
    const indexPath = remotePath(cfg, 'articles', 'index.json')
    const indexEntries = await buildIndexFromDb()
    await writeRemoteString(sftp, indexPath, JSON.stringify(indexEntries, null, 2))

    // Bootstrap the shell files: .htaccess rewrite rules + article.php
    // renderer. Overwriting them on every publish keeps the hosting in sync
    // with the repo so you don't need a separate "deploy letters-site" flow.
    await syncSiteAssets(sftp, cfg)
  })

  log.info({
    articleId: article.id,
    slug: article.blog_slug,
    durationMs: Date.now() - startedAt,
  }, 'publish ok')
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
    // Landing + archive pages — also synced so edits to the blog nav
    // (e.g. adding a new rubric tab) don't silently stay local.
    {
      local: join(process.cwd(), 'services/letters-site/index.html'),
      remote: remotePath(cfg, 'index.html'),
    },
    {
      local: join(process.cwd(), 'services/letters-site/archive.html'),
      remote: remotePath(cfg, 'archive.html'),
    },
  ]
  for (const { local, remote } of assets) {
    try {
      if (!existsSync(local)) continue
      const content = readFileSync(local, 'utf-8')
      await writeRemoteString(sftp, remote, content)
    } catch (err) {
      // Shell-sync is best-effort: the per-article JSON already uploaded.
      // We log loudly though — silent swallow here is what hid the burger-
      // menu / CSS regressions in the past.
      const msg = err instanceof Error ? err.message : String(err)
      log.error({ local, remote, err: msg }, 'site asset sync failed')
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

    // Rebuild from DB so the index reflects the just-applied status change
    // (the caller flipped status to 'draft' / deleted the row before us).
    const indexPath = remotePath(cfg, 'articles', 'index.json')
    const indexEntries = await buildIndexFromDb()
    await writeRemoteString(sftp, indexPath, JSON.stringify(indexEntries, null, 2))
  })
}
