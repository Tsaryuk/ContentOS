import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { publishArticleFiles } from '@/lib/articles/publish'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
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

    const { url } = await publishArticleFiles(article)

    await supabaseAdmin
      .from('nl_articles')
      .update({
        status: 'published',
        published_at: article.published_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({ success: true, url })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка публикации'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
