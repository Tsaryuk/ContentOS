import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const id = req.nextUrl.searchParams.get('id')

  if (id) {
    const { data, error } = await supabaseAdmin
      .from('carousels')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Carousel not found' }, { status: 404 })
    }
    return NextResponse.json({ carousel: data })
  }

  // List all carousels
  const projectId = req.nextUrl.searchParams.get('projectId')
  let query = supabaseAdmin
    .from('carousels')
    .select('id, topic, preset, slide_count, status, illustration_url, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ carousels: data ?? [] })
}
