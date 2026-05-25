// Convert an idea into a real article draft. Body lets the caller pick
// which AI-suggested title to use (or supply their own). The idea row's
// status flips to 'drafted' and gets a back-reference to the new article.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { requireProjectAccess } from '@/lib/project-access'

interface IdeaRow {
  id: string
  project_id: string | null
  raw_thought: string
  ai_titles: string[] | null
  ai_tags: string[] | null
  ai_angles: string[] | null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  const session = await getSession()

  const { data: idea, error: ideaErr } = await supabaseAdmin
    .from('nl_article_ideas')
    .select('id, project_id, raw_thought, ai_titles, ai_tags, ai_angles')
    .eq('id', id)
    .single<IdeaRow>()
  if (ideaErr || !idea) {
    return NextResponse.json({ error: 'Идея не найдена' }, { status: 404 })
  }

  const denied = await requireProjectAccess(idea.project_id)
  if (denied) return denied

  const body = await req.json().catch(() => ({}))
  const chosenTitle: string = typeof body.title === 'string' && body.title.trim()
    ? body.title.trim()
    : (idea.ai_titles?.[0] ?? '(без заголовка)')

  // Seed the new article. body_html is intentionally a short skeleton —
  // raw thought + bullet list of angles + tag-as-hash. The author opens
  // the article and writes from there. We don't try to "generate the
  // article" from the idea; that's a different feature.
  const anglesHtml = (idea.ai_angles ?? [])
    .map((a) => `<li>${escapeHtml(a)}</li>`)
    .join('')
  const seedHtml = `<p><em>Из идеи:</em> ${escapeHtml(idea.raw_thought)}</p>
${anglesHtml ? `<h2>Углы</h2>\n<ul>${anglesHtml}</ul>` : ''}`

  const { data: created, error: createErr } = await supabaseAdmin
    .from('nl_articles')
    .insert({
      title: chosenTitle,
      subtitle: '',
      body_html: seedHtml,
      category: idea.ai_tags?.[0] ?? null,
      tags: idea.ai_tags ?? [],
      project_id: idea.project_id ?? session.activeProjectId ?? null,
      created_by: auth.userId,
    })
    .select('id, title')
    .single()

  if (createErr || !created) {
    return NextResponse.json({ error: createErr?.message ?? 'Не удалось создать статью' }, { status: 500 })
  }

  await supabaseAdmin
    .from('nl_article_ideas')
    .update({
      status: 'drafted',
      promoted_article_id: created.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  return NextResponse.json({ article: created })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
