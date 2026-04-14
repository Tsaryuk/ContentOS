import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

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
    const body = await req.json()
    body.updated_at = new Date().toISOString()

    // Increment version on body_html changes
    if (body.body_html !== undefined) {
      const { data: current } = await supabaseAdmin
        .from('nl_articles').select('version').eq('id', id).single()
      body.version = (current?.version ?? 1) + 1
    }

    const { data, error } = await supabaseAdmin
      .from('nl_articles')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Auto-republish if already published — updates static HTML on letters.tsaryuk.ru
    let republished = false
    if (data.status === 'published' && data.blog_slug) {
      try {
        const { publishArticleFiles } = await import('@/lib/articles/publish')
        await publishArticleFiles(data)
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

  const { error } = await supabaseAdmin.from('nl_articles').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
