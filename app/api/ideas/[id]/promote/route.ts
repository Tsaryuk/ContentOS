// Convert an idea into either:
//   - a new article draft (default flow for capture-style ideas), or
//   - a new newsletter issue (when the idea has source_article_id — i.e.
//     a resurface suggestion from the weekly cron).
//
// Body lets the caller pick which AI-suggested title to use (or supply
// their own). The idea row's status flips to 'drafted' and gets a back-
// reference to whichever artefact was created (promoted_article_id or
// the newly created issue id, depending on path).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { requireProjectAccess } from '@/lib/project-access'
import { nextIssueNumber } from '@/lib/newsletter/issue-number'

interface IdeaRow {
  id: string
  project_id: string | null
  raw_thought: string
  ai_titles: string[] | null
  ai_tags: string[] | null
  ai_angles: string[] | null
  similar_to: Array<Record<string, unknown>> | null
  source_article_id: string | null
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
    .select('id, project_id, raw_thought, ai_titles, ai_tags, ai_angles, similar_to, source_article_id')
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

  // Branch: resurface → newsletter issue, fresh idea → article draft.
  if (idea.source_article_id) {
    return promoteAsNewsletter(idea, chosenTitle, session.activeProjectId ?? null)
  }
  return promoteAsArticle(idea, chosenTitle, auth.userId, session.activeProjectId ?? null)
}

async function promoteAsArticle(
  idea: IdeaRow,
  chosenTitle: string,
  userId: string,
  fallbackProjectId: string | null,
): Promise<NextResponse> {
  const anglesHtml = (idea.ai_angles ?? [])
    .map((a) => `<li>${escapeHtml(a)}</li>`)
    .join('')
  const seedHtml = `<p><em>Из идеи:</em> ${escapeHtml(idea.raw_thought)}</p>
${anglesHtml ? `<h2>Углы</h2>\n<ul>${anglesHtml}</ul>` : ''}`

  const { data: created, error } = await supabaseAdmin
    .from('nl_articles')
    .insert({
      title: chosenTitle,
      subtitle: '',
      body_html: seedHtml,
      category: idea.ai_tags?.[0] ?? null,
      tags: idea.ai_tags ?? [],
      project_id: idea.project_id ?? fallbackProjectId,
      created_by: userId,
    })
    .select('id, title')
    .single()
  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? 'Не удалось создать статью' }, { status: 500 })
  }

  await supabaseAdmin
    .from('nl_article_ideas')
    .update({
      status: 'drafted',
      promoted_article_id: created.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', idea.id)

  return NextResponse.json({ article: created })
}

async function promoteAsNewsletter(
  idea: IdeaRow,
  chosenSubject: string,
  fallbackProjectId: string | null,
): Promise<NextResponse> {
  if (!idea.source_article_id) {
    return NextResponse.json({ error: 'Источник статьи не указан' }, { status: 400 })
  }

  // Pull the original article so we can seed the new issue with the
  // intro paragraph from raw_thought + angles + a CTA back to the
  // original article.
  const { data: source } = await supabaseAdmin
    .from('nl_articles')
    .select('id, title, blog_slug, subtitle, project_id')
    .eq('id', idea.source_article_id)
    .single<{ id: string; title: string; blog_slug: string | null; subtitle: string | null; project_id: string | null }>()
  if (!source) return NextResponse.json({ error: 'Исходная статья не найдена' }, { status: 404 })

  // Stash from similar_to[0] (resurface tick puts { preheader, source_subject } there).
  const stash = Array.isArray(idea.similar_to) && idea.similar_to.length > 0
    ? idea.similar_to[0] as { preheader?: string; source_subject?: string }
    : {}

  const projectId = idea.project_id ?? source.project_id ?? fallbackProjectId
  const issueNumber = await nextIssueNumber(supabaseAdmin, projectId)

  const anglesList = (idea.ai_angles ?? [])
    .map((a) => `<li>${escapeHtml(a)}</li>`)
    .join('')
  const ctaUrl = source.blog_slug ? `https://letters.tsaryuk.ru/articles/${source.blog_slug}` : null
  const ctaBlock = ctaUrl
    ? `<p><a href="${ctaUrl}">Прочитать оригинальную статью «${escapeHtml(source.title)}»</a></p>`
    : `<p><em>Оригинал: «${escapeHtml(source.title)}»</em></p>`

  // The "intro_paragraph" lives at the start of idea.raw_thought after
  // the "Resurface статьи ... — открываемость X%." header line. Just
  // take the part after the first paragraph break.
  const introMatch = idea.raw_thought.split(/\n\n+/)
  const intro = introMatch.length > 1 ? introMatch.slice(1).join('\n\n') : idea.raw_thought
  const bodyHtml = `<p>${escapeHtml(intro)}</p>
${anglesList ? `<h2>Что бы я добавил сейчас</h2>\n<ul>${anglesList}</ul>` : ''}
${ctaBlock}`

  const { data: created, error } = await supabaseAdmin
    .from('nl_issues')
    .insert({
      subject: chosenSubject,
      preheader: typeof stash.preheader === 'string' ? stash.preheader : '',
      tag: 'Спустя время',
      subtitle: source.subtitle ?? '',
      body_html: bodyHtml,
      issue_number: issueNumber,
      status: 'draft',
      project_id: projectId,
    })
    .select('id, subject')
    .single()
  if (error || !created) {
    return NextResponse.json({ error: error?.message ?? 'Не удалось создать выпуск' }, { status: 500 })
  }

  await supabaseAdmin
    .from('nl_article_ideas')
    .update({
      status: 'drafted',
      // promoted_article_id is the field we have on the schema; reuse
      // for promoted-as-newsletter case so the Inbox UI still has a
      // link to follow. The route handler distinguishes the two cases
      // by source_article_id presence.
      promoted_article_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', idea.id)

  return NextResponse.json({ issue: created })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
