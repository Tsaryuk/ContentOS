import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const session = await getSession()
  const projectId = session.activeProjectId
  const status = req.nextUrl.searchParams.get('status')

  let query = supabaseAdmin
    .from('nl_articles')
    .select('*')

  if (status) query = query.eq('status', status)
  if (projectId) query = query.eq('project_id', projectId)

  query = query.order('created_at', { ascending: false })

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ articles: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json()
    const session = await getSession()

    const { data, error } = await supabaseAdmin
      .from('nl_articles')
      .insert({
        title: body.title ?? '',
        subtitle: body.subtitle ?? '',
        body_html: body.body_html ?? '',
        category: body.category ?? null,
        tags: body.tags ?? [],
        project_id: session.activeProjectId ?? null,
        created_by: auth.userId,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ article: data })
  } catch {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
