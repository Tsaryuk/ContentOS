import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'
import { getSession } from '@/lib/session'
import { EMAIL_WRITER_PROMPT } from '@/lib/articles/prompts'
import { nextIssueNumber } from '@/lib/newsletter/issue-number'
import { renderEmailBody, type SectionKind } from '@/lib/newsletter/sections'

const anthropic = new Anthropic()

const DEFAULT_TAG = 'Разговор о...'

// Claude occasionally wraps JSON in fences despite the prompt; strip them.
function extractJsonPayload(raw: string): string {
  return raw
    .replace(/^```json?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

interface EmailWriterPayload {
  digest_html?: string
  practice_html?: string
}

function parsePayload(raw: string): EmailWriterPayload {
  try {
    const parsed = JSON.parse(extractJsonPayload(raw)) as Record<string, unknown>
    return {
      digest_html: typeof parsed.digest_html === 'string' ? parsed.digest_html : undefined,
      practice_html: typeof parsed.practice_html === 'string' ? parsed.practice_html : undefined,
    }
  } catch {
    // Model broke the JSON contract — put the full text into the digest
    // section so we at least don't lose the generation. The user can clean
    // it up manually in the editor.
    return { digest_html: raw }
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const textOnly = article.body_html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

    // Generate digest + practical task only. The remaining four sections
    // (philosophy / lifehack / anons / signoff) are seeded as placeholders
    // that the chat wizard (C2) or the author fills in later.
    const response = await anthropic.messages.create({
      model: AI_MODELS.claude,
      max_tokens: 4096,
      system: EMAIL_WRITER_PROMPT(article.blog_slug || ''),
      messages: [{
        role: 'user',
        content: `Статья «${article.title}» (подзаголовок: ${article.subtitle || '—'}).\n\nТекст:\n${textOnly.slice(0, 8000)}`,
      }],
    })

    const rawText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    const payload = parsePayload(rawText)
    const sectionContent: Partial<Record<SectionKind, string>> = {}
    if (payload.digest_html) sectionContent.digest = payload.digest_html
    if (payload.practice_html) sectionContent.practice = payload.practice_html
    const bodyHtml = renderEmailBody(sectionContent)

    // Create email issue linked to article.
    // Populate issue metadata from the article so the editor doesn't open with
    // empty fields:
    // - subject / subtitle / tag / preheader default from article
    // - issue_number auto-assigned as max(existing) + 1 so UI doesn't show a dash
    const session = await getSession()
    const projectId = session.activeProjectId ?? null

    const preheaderDefault = (article.subtitle || article.seo_description || textOnly).slice(0, 140)
    const issueNumber = await nextIssueNumber(supabaseAdmin, projectId)

    const { data: issue, error } = await supabaseAdmin
      .from('nl_issues')
      .insert({
        subject: article.title,
        subtitle: article.subtitle,
        preheader: preheaderDefault,
        tag: DEFAULT_TAG,
        issue_number: issueNumber,
        body_html: bodyHtml,
        category: article.category,
        tags: article.tags,
        project_id: projectId,
        created_by: auth.userId,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Link article to issue
    await supabaseAdmin
      .from('nl_articles')
      .update({ email_issue_id: issue.id, updated_at: new Date().toISOString() })
      .eq('id', id)

    return NextResponse.json({ issue })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка генерации'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
