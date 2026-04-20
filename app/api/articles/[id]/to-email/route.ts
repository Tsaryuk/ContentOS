import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'
import { getSession } from '@/lib/session'
import { EMAIL_WRITER_PROMPT } from '@/lib/articles/prompts'
import { nextIssueNumber } from '@/lib/newsletter/issue-number'

const anthropic = new Anthropic()

const DEFAULT_TAG = 'Разговор о...'

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

    // Generate shortened email version using centralized email writer prompt
    const response = await anthropic.messages.create({
      model: AI_MODELS.claude,
      max_tokens: 4096,
      system: EMAIL_WRITER_PROMPT(article.blog_slug || ''),
      messages: [{
        role: 'user',
        content: `Сделай email-версию этой статьи:\n\nЗаголовок: ${article.title}\n\n${textOnly.slice(0, 5000)}`,
      }],
    })

    const emailHtml = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim()

    // Create email issue linked to article.
    // Populate issue metadata from the article so the editor doesn't open with empty fields:
    // - subject / subtitle / tag / preheader default from article (user can override in editor)
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
        body_html: emailHtml,
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
