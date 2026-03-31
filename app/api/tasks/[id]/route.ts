import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

const TASK_SELECT = '*, assignee:users!assignee_id(id, name, email), creator:users!creator_id(id, name), project:projects!project_id(id, name, color)'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .select(TASK_SELECT)
    .eq('id', params.id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 })
  }

  return NextResponse.json({ task: data })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json()
    const update: Record<string, unknown> = {}

    if (body.title !== undefined) update.title = body.title.trim()
    if (body.description !== undefined) update.description = body.description?.trim() || null
    if (body.status !== undefined) update.status = body.status
    if (body.priority !== undefined) update.priority = body.priority
    if (body.assignee_id !== undefined) update.assignee_id = body.assignee_id || null
    if (body.project_id !== undefined) update.project_id = body.project_id || null
    if (body.due_date !== undefined) update.due_date = body.due_date || null
    if (body.related_type !== undefined) update.related_type = body.related_type || null
    if (body.related_id !== undefined) update.related_id = body.related_id || null

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'Нечего обновлять' }, { status: 400 })
    }

    update.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from('tasks')
      .update(update)
      .eq('id', params.id)
      .select(TASK_SELECT)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ task: data })
  } catch {
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { data: task } = await supabaseAdmin
    .from('tasks')
    .select('creator_id')
    .eq('id', params.id)
    .single()

  if (!task) {
    return NextResponse.json({ error: 'Задача не найдена' }, { status: 404 })
  }

  if (task.creator_id !== auth.userId && auth.userRole !== 'admin') {
    return NextResponse.json({ error: 'Только создатель или админ может удалить задачу' }, { status: 403 })
  }

  const { error } = await supabaseAdmin
    .from('tasks')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
