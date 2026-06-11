// Idea inbox CRUD. POST captures a raw thought and synchronously runs
// the AI suggester so the page lands with the three titles already
// rendered — no separate "generate" step.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { suggestForIdea } from '@/lib/articles/idea-suggestions'
import { rateLimit, clientIp, rateLimitResponse } from '@/lib/rate-limit'
import { dbErrorResponse } from '@/lib/api-error'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const session = await getSession()
  const status = req.nextUrl.searchParams.get('status') // null = all but archived

  let query = supabaseAdmin
    .from('nl_article_ideas')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)

  if (status) query = query.eq('status', status)
  else query = query.neq('status', 'archived')

  if (session.userRole !== 'admin' && session.activeProjectId) {
    query = query.eq('project_id', session.activeProjectId)
  }

  const { data, error } = await query
  if (error) return dbErrorResponse(error, '/api/ideas')
  return NextResponse.json({ ideas: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  // Each capture fires an Anthropic call — cap traffic per IP so a stuck
  // form-submit loop doesn't drain the budget.
  const rl = await rateLimit('ai:ideas', clientIp(req), 20, 60)
  if (!rl.allowed) return rateLimitResponse(rl)

  try {
    const body = await req.json()
    const rawThought = typeof body.raw_thought === 'string' ? body.raw_thought.trim() : ''
    if (!rawThought) {
      return NextResponse.json({ error: 'Опиши идею хотя бы парой слов' }, { status: 400 })
    }
    if (rawThought.length > 2000) {
      return NextResponse.json({ error: 'Идея больше 2000 символов — может разверни уже в статью?' }, { status: 400 })
    }

    const session = await getSession()
    const projectId = session.activeProjectId ?? null

    const suggestions = await suggestForIdea(rawThought, projectId)

    const { data, error } = await supabaseAdmin
      .from('nl_article_ideas')
      .insert({
        project_id: projectId,
        created_by: auth.userId,
        raw_thought: rawThought,
        ai_titles: suggestions.titles,
        ai_tags: suggestions.tags,
        ai_angles: suggestions.angles,
        similar_to: suggestions.similar,
        status: 'new',
      })
      .select('*')
      .single()

    if (error) return dbErrorResponse(error, '/api/ideas')
    return NextResponse.json({ idea: data })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка сервера'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
