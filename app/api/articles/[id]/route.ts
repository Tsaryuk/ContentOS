import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// Only these fields may be updated via PATCH — anything else is ignored
// to prevent mass-assignment (status spoofing, slug injection, created_by tamper).
const ARTICLE_ALLOWED_FIELDS = new Set([
  'title', 'subtitle', 'body_html', 'cover_url', 'youtube_url',
  'category', 'seo_title', 'seo_description', 'blog_slug',
  'status', 'published_at', 'show_cover_in_article',
])

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,100}$/

function pickAllowed<T extends Record<string, unknown>>(
  body: T,
  allowed: Set<string>,
): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (allowed.has(key)) out[key] = body[key]
  }
  return out as Partial<T>
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  const { data, error } = await supabaseAdmin
    .from('nl_articles')
    .select('*, ai_messages:nl_article_messages(*)')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Статья не найдена' }, { status: 404 })
  return NextResponse.json({ article: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  try {
    const raw = await req.json()
    const update: Record<string, unknown> = pickAllowed(raw, ARTICLE_ALLOWED_FIELDS)

    // Validate slug if present — protects static HTML writer against path traversal
    if (typeof update.blog_slug === 'string' && update.blog_slug.length > 0) {
      if (!SLUG_RE.test(update.blog_slug)) {
        return NextResponse.json(
          { error: 'blog_slug invalid — allowed: lowercase letters, digits, hyphens' },
          { status: 400 },
        )
      }
    }

    update.updated_at = new Date().toISOString()

    // Fetch current article to detect slug changes and track version
    const { data: current } = await supabaseAdmin
      .from('nl_articles').select('version, blog_slug').eq('id', id).single()

    const previousSlug = current?.blog_slug ?? null

    // Increment version on body_html changes
    if (update.body_html !== undefined) {
      update.version = (current?.version ?? 1) + 1
    }

    const { data, error } = await supabaseAdmin
      .from('nl_articles')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Auto-republish if already published — updates static HTML on letters.tsaryuk.ru
    // Passes previousSlug so old file is removed if slug changed
    let republished = false
    if (data.status === 'published' && data.blog_slug) {
      try {
        const { publishArticleFiles } = await import('@/lib/articles/publish')
        await publishArticleFiles(data, { previousSlug })
        republished = true
      } catch (err) {
        console.error('[auto-republish] failed:', err)
      }
    }

    return NextResponse.json({ article: data, republished })
  } catch {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  // Fetch slug before delete so we can remove HTML file
  const { data: current } = await supabaseAdmin
    .from('nl_articles').select('blog_slug').eq('id', id).single()

  const { error } = await supabaseAdmin.from('nl_articles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Remove static HTML file + index.json entry
  if (current?.blog_slug) {
    try {
      const { unpublishArticleFiles } = await import('@/lib/articles/publish')
      await unpublishArticleFiles(current.blog_slug)
    } catch (err) {
      console.error('[unpublish] failed:', err)
    }
  }

  return NextResponse.json({ success: true })
}
