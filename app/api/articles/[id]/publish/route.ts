import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { execSync } from 'child_process'
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  try {
    const { data: article } = await supabaseAdmin
      .from('nl_articles')
      .select('*')
      .eq('id', id)
      .single()

    if (!article) return NextResponse.json({ error: 'Статья не найдена' }, { status: 404 })
    if (!article.blog_slug) return NextResponse.json({ error: 'Укажите URL slug в SEO' }, { status: 400 })
    if (!article.body_html?.trim()) return NextResponse.json({ error: 'Статья пустая' }, { status: 400 })

    // Read article template
    const templatePath = join(process.cwd(), 'services/letters-site/article-template.html')
    let template = ''
    if (existsSync(templatePath)) {
      template = readFileSync(templatePath, 'utf-8')
    } else {
      return NextResponse.json({ error: 'Шаблон статьи не найден' }, { status: 500 })
    }

    // Build YouTube embed
    const ytMatch = article.youtube_url?.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?\s]+)/)
    const ytEmbed = ytMatch
      ? `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${ytMatch[1]}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`
      : ''

    const date = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

    // Replace placeholders
    let html = template
      .replace(/\{\{TITLE\}\}/g, article.title)
      .replace(/\{\{DESCRIPTION\}\}/g, article.seo_description || article.subtitle)
      .replace(/\{\{COVER_URL\}\}/g, article.cover_url || '')
      .replace(/\{\{CATEGORY\}\}/g, article.category || '')
      .replace(/\{\{DATE\}\}/g, date)
      .replace(/\{\{NUMBER\}\}/g, '')
      .replace(/\{\{BODY_HTML\}\}/g, ytEmbed + '\n' + article.body_html)

    // Write to server via SSH (or local if dev)
    const articleDir = '/var/www/letters/articles'
    const filePath = join(articleDir, `${article.blog_slug}.html`)

    if (existsSync('/var/www/letters')) {
      // On server
      if (!existsSync(articleDir)) mkdirSync(articleDir, { recursive: true })
      writeFileSync(filePath, html, 'utf-8')
    } else {
      // Dev — write locally and scp
      const tmpPath = `/tmp/article-${article.blog_slug}.html`
      writeFileSync(tmpPath, html, 'utf-8')
      // SCP will be handled separately
    }

    // Update articles/index.json
    const indexPath = '/var/www/letters/articles/index.json'
    let articles: any[] = []
    if (existsSync(indexPath)) {
      articles = JSON.parse(readFileSync(indexPath, 'utf-8'))
    }

    // Remove existing entry for this slug
    articles = articles.filter((a: any) => a.slug !== article.blog_slug)

    // Add at beginning
    articles.unshift({
      slug: article.blog_slug,
      title: article.title,
      date,
      category: article.category || null,
      cover: article.cover_url || null,
    })

    writeFileSync(indexPath, JSON.stringify(articles, null, 2), 'utf-8')

    // Update article status
    await supabaseAdmin
      .from('nl_articles')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({
      success: true,
      url: `https://letters.tsaryuk.ru/articles/${article.blog_slug}.html`,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка публикации'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
