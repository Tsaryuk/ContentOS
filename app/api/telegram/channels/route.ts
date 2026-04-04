import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/session'

export async function GET(_req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const session = await getSession()
  const projectId = session.activeProjectId

  let query = supabaseAdmin
    .from('tg_channels')
    .select('*, account:tg_accounts!tg_account_id(id, phone, first_name, username)')
    .eq('is_active', true)
    .order('title')

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ channels: data ?? [] })
}
