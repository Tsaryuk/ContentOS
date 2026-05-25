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
  /** True when the article body contains the [NOMADMIND] paywall marker —
   *  the second half is hidden server-side at render time and a CTA to the
   *  closed NomadMind community is shown instead. Used by index.html /
   *  archive.html to render a lock badge on the card. */
  gated?: boolean
}

// Author types this literal in the editor at the cut point (via the Lock
// toolbar button in ArticleEditor). Survives sanitization as plain text —
// the sanitizer keeps text nodes untouched. PHP splits on it at render time
// and never emits the second half to the client.
const PAYWALL_MARKER_RE = /\[NOMADMIND\]/i

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
    // body_html is selected only to detect the [NOMADMIND] marker — it is
    // NOT echoed into the index payload. Without a dedicated `gated` column
    // we derive the flag at index-build time so existing posts get reclassified
    // automatically when the author adds/removes the marker.
    .select('blog_slug, title, published_at, category, tags, cover_url, body_html')
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
    gated: PAYWALL_MARKER_RE.test((a.body_html as string | null) ?? ''),
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
  /** True when the body contains the [NOMADMIND] paywall marker. PHP uses
   *  this to render only the preview portion and append the community CTA. */
  gated: boolean
}

// Build the per-article JSON that /article.php on the hosting reads and
// renders inside the central shell. body_html goes through sanitizeArticleHtml
// here, before it ever leaves the server — PHP trusts the field.
function buildArticlePayload(article: Article): ArticlePayload {
  const tags = (article.tags ?? []).filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
  const rawBody = article.body_html ?? ''
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
    body_html: sanitizeArticleHtml(rawBody),
    published_at: article.published_at,
    gated: PAYWALL_MARKER_RE.test(rawBody),
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

    // Assemble every file we want to write in this publish into a flat
    // list (final remote path → content). We then upload them all into
    // a temporary staging directory and rename them into place at the
    // end — this is the closest SFTP gets to a transaction.
    //
    // Why bother: previously a network blip after `articles/{slug}.json`
    // but before `assets/article.css` left the live site with new content
    // and outdated styles. Now if any single file fails to land in
    // staging, NONE of the production files are touched.
    const indexEntries = await buildIndexFromDb()
    const indexPath = remotePath(cfg, 'articles', 'index.json')
    const jsonPath = remoteArticleJsonPath(cfg, article.blog_slug!)
    const targets: Array<{ remote: string; content: string }> = [
      { remote: jsonPath, content: JSON.stringify(payload, null, 2) },
      { remote: indexPath, content: JSON.stringify(indexEntries, null, 2) },
      ...collectSiteAssetTargets(cfg),
    ]
    await stagedWriteAndPromote(sftp, cfg, targets)

    // Cleanup: legacy .html for the current slug, and renamed-slug
    // artifacts. These are deletes, not writes — they can't go through
    // staging the same way. Run them after the writes succeed so the
    // production page has the new content before the old one disappears.
    const htmlPath = remoteArticlePath(cfg, article.blog_slug!)
    if (await sftp.exists(htmlPath)) {
      try { await sftp.delete(htmlPath) } catch { /* ignore */ }
    }
    if (prev && prev !== article.blog_slug) {
      for (const remove of [remoteArticlePath(cfg, prev), remoteArticleJsonPath(cfg, prev)]) {
        try {
          if (await sftp.exists(remove)) await sftp.delete(remove)
        } catch { /* previous slug invalid — skip cleanup */ }
      }
    }
  })

  log.info({
    articleId: article.id,
    slug: article.blog_slug,
    durationMs: Date.now() - startedAt,
  }, 'publish ok')
  return { url: `https://letters.tsaryuk.ru/articles/${article.blog_slug}` }
}

/**
 * Upload all targets to a temporary staging directory, then atomically
 * rename each into its final remote path. If any upload fails, the
 * production paths are untouched and the staging directory is left for
 * cleanup (cron should sweep `.publish-staging-*` older than 24h).
 *
 * Per-file renames are atomic on POSIX file systems (reg.ru's hosting
 * is Linux). The window between the first and last rename is on the
 * order of seconds, not minutes-to-never as before. Cross-file
 * consistency is now "at most one publish stale" rather than "split-
 * brain forever".
 */
async function stagedWriteAndPromote(
  sftp: Client,
  cfg: SftpConfig,
  targets: Array<{ remote: string; content: string }>,
): Promise<void> {
  const stagingId = `.publish-staging-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const stagingRoot = remotePath(cfg, stagingId)

  // Map each target to its staging path. Keep them under stagingRoot so
  // we can sweep the whole directory in cleanup.
  const items = targets.map((t) => {
    const rel = t.remote.startsWith(cfg.remoteDir + '/')
      ? t.remote.slice(cfg.remoteDir.length + 1)
      : t.remote
    return {
      stage: posix.join(stagingRoot, rel),
      final: t.remote,
      content: t.content,
    }
  })

  try {
    // 1. mkdir -p for every staging path's directory.
    const dirs = new Set(items.map((i) => posix.dirname(i.stage)))
    for (const d of dirs) {
      if (!(await sftp.exists(d))) {
        await withRetry(`mkdir ${d}`, () => sftp.mkdir(d, true))
      }
    }

    // 2. Upload everything into staging. If any of these throw, we
    // abort BEFORE touching production paths.
    for (const it of items) {
      await writeRemoteString(sftp, it.stage, it.content)
    }

    // 3. Promote each staged file to its final destination via rename.
    // rename() over an existing file overwrites atomically on Linux,
    // but some SFTP servers (including older ProFTPD) refuse — fall
    // back to delete+rename if the direct rename errors out.
    for (const it of items) {
      const finalDir = posix.dirname(it.final)
      if (!(await sftp.exists(finalDir))) {
        await withRetry(`mkdir ${finalDir}`, () => sftp.mkdir(finalDir, true))
      }
      try {
        await withRetry(`rename ${it.stage} → ${it.final}`, () => sftp.rename(it.stage, it.final))
      } catch (err) {
        // Server doesn't allow rename-over-existing. Drop the live file
        // first, then rename. Window of "file missing" is on the order
        // of ms — much smaller than the previous "file inconsistent".
        const msg = err instanceof Error ? err.message : String(err)
        log.warn({ stage: it.stage, final: it.final, err: msg }, 'rename failed, falling back to delete+rename')
        try { if (await sftp.exists(it.final)) await sftp.delete(it.final) } catch { /* ignore */ }
        await withRetry(`rename-after-delete ${it.stage} → ${it.final}`, () => sftp.rename(it.stage, it.final))
      }
    }
  } finally {
    // Best-effort cleanup of the staging directory. If we got here via
    // an upload failure, this also tidies up partial uploads. If rename
    // failed midway, leftover staged files stay until next cleanup —
    // they don't break anything.
    try { await sftp.rmdir(stagingRoot, true) } catch { /* ignore */ }
  }
}

/**
 * Push shell files (article.php, article.css, index.html, archive.html…)
 * from the local letters-site/ to the host WITHOUT publishing an article.
 * Used by the "Sync site files" button in /articles — handy after editing
 * the PHP shell or CSS, when republishing an article would otherwise bump
 * its date for no reason.
 *
 * Goes through the same staged-write + atomic-rename pipeline as a real
 * publish, so a failed sync never leaves the live site half-updated.
 */
export async function syncSiteAssetsOnly(): Promise<{ uploaded: string[] }> {
  let uploaded: string[] = []
  await withSftp(async (sftp, cfg) => {
    const targets = collectSiteAssetTargets(cfg)
    if (!targets.length) return
    await stagedWriteAndPromote(sftp, cfg, targets)
    uploaded = targets.map((t) =>
      t.remote.startsWith(cfg.remoteDir + '/') ? t.remote.slice(cfg.remoteDir.length + 1) : t.remote,
    )
  })
  log.info({ uploaded }, 'site assets synced (standalone)')
  return { uploaded }
}

/** Build the (local → remote) list for shell files. */
function collectSiteAssetTargets(cfg: SftpConfig): Array<{ remote: string; content: string }> {
  const sources: Array<{ local: string; remote: string }> = [
    { local: join(process.cwd(), 'services/letters-site/.htaccess'),
      remote: remotePath(cfg, '.htaccess') },
    { local: join(process.cwd(), 'services/letters-site/article.php'),
      remote: remotePath(cfg, 'article.php') },
    { local: join(process.cwd(), 'services/letters-site/assets/article.css'),
      remote: remotePath(cfg, 'assets', 'article.css') },
    { local: join(process.cwd(), 'services/letters-site/assets/article.js'),
      remote: remotePath(cfg, 'assets', 'article.js') },
    { local: join(process.cwd(), 'services/letters-site/index.html'),
      remote: remotePath(cfg, 'index.html') },
    { local: join(process.cwd(), 'services/letters-site/archive.html'),
      remote: remotePath(cfg, 'archive.html') },
  ]
  const out: Array<{ remote: string; content: string }> = []
  for (const s of sources) {
    if (!existsSync(s.local)) continue
    out.push({ remote: s.remote, content: readFileSync(s.local, 'utf-8') })
  }
  return out
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
