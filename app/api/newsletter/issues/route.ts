import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { nextIssueNumber } from '@/lib/newsletter/issue-number'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const url = req.nextUrl.searchParams
  const status = url.get('status')
  const session = await getSession()
  const projectId = session.activeProjectId

  let query = supabaseAdmin
    .from('nl_issues')
    .select('*, campaign:nl_campaigns(*)')

  if (status) query = query.eq('status', status)
  if (projectId) query = query.eq('project_id', projectId)

  query = query.order('created_at', { ascending: false })

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ issues: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json()
    const session = await getSession()
    const projectId = session.activeProjectId ?? null

    // Auto-assign issue_number unless the client already supplied one (e.g. import flow).
    const issueNumber = typeof body.issue_number === 'number'
      ? body.issue_number
      : await nextIssueNumber(supabaseAdmin, projectId)

    const insert = {
      subject: body.subject ?? '',
      preheader: body.preheader ?? '',
      tag: body.tag ?? '',
      subtitle: body.subtitle ?? '',
      body_html: body.body_html ?? '',
      body_json: body.body_json ?? null,
      issue_number: issueNumber,
      category: body.category ?? null,
      tags: body.tags ?? [],
      project_id: projectId,
      created_by: auth.userId,
    }

    const { data, error } = await supabaseAdmin
      .from('nl_issues')
      .insert(insert)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ issue: data })
  } catch {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
