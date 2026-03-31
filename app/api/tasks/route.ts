import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const url = req.nextUrl.searchParams
  const status = url.get('status')
  const assigneeId = url.get('assignee_id')
  const projectId = url.get('project_id')
  const priority = url.get('priority')

  let query = supabaseAdmin
    .from('tasks')
    .select('*, assignee:users!assignee_id(id, name, email), creator:users!creator_id(id, name), project:projects!project_id(id, name, color)')

  if (status) query = query.eq('status', status)
  if (assigneeId) query = query.eq('assignee_id', assigneeId)
  if (projectId) query = query.eq('project_id', projectId)
  if (priority) query = query.eq('priority', priority)

  query = query.order('priority', { ascending: true })
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ tasks: data })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json()

    if (!body.title?.trim()) {
      return NextResponse.json({ error: 'Название задачи обязательно' }, { status: 400 })
    }

    const insert = {
      title: body.title.trim(),
      description: body.description?.trim() || null,
      status: body.status ?? 'todo',
      priority: body.priority ?? 'medium',
      assignee_id: body.assignee_id || null,
      creator_id: auth.userId,
      project_id: body.project_id || null,
      due_date: body.due_date || null,
      related_type: body.related_type || null,
      related_id: body.related_id || null,
    }

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .insert(insert)
      .select('*, assignee:users!assignee_id(id, name, email), creator:users!creator_id(id, name), project:projects!project_id(id, name, color)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ task: data })
  } catch {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}
