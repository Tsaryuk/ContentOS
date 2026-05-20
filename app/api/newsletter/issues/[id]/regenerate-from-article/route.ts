// Regenerate the AI-filled sections of an existing newsletter issue from
// the linked article. Used when the prompt evolved (e.g. PR #75 moved CTA
// out of digest, expanded digest to half-article length) and the user
// wants old draft issues to follow the new shape without re-creating them
// from scratch.
//
// Touches: section[data-kind="digest"], section[data-kind="practice"],
// section[data-kind="cta_article"]. Other sections (philosophy, lifehack,
// anons, signoff) are left alone — they're filled by the user or by the
// chat wizard, regenerating them would clobber that work.
//
// If no article is linked to this issue (manual newsletter), this returns
// 400 — there's nothing to regenerate from.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'
import { EMAIL_WRITER_PROMPT } from '@/lib/articles/prompts'
import { replaceSection, buildArticleCta } from '@/lib/newsletter/sections'

const anthropic = new Anthropic()

function extractJsonPayload(raw: string): string {
  return raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()
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
    return { digest_html: raw }
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  try {
    // Issue with linked article (reverse FK lookup).
    const { data: issue, error: issueErr } = await supabaseAdmin
      .from('nl_issues')
      .select('id, body_html')
      .eq('id', id)
      .single()
    if (issueErr || !issue) {
      return NextResponse.json({ error: 'Выпуск не найден' }, { status: 404 })
    }

    const { data: article } = await supabaseAdmin
      .from('nl_articles')
      .select('id, title, subtitle, body_html, blog_slug')
      .eq('email_issue_id', id)
      .maybeSingle()
    if (!article) {
      return NextResponse.json(
        { error: 'У этого письма нет связанной статьи — перегенерировать нечего' },
        { status: 400 },
      )
    }

    const textOnly = (article.body_html ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (!textOnly) {
      return NextResponse.json({ error: 'Статья пустая' }, { status: 400 })
    }

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
    let bodyHtml = issue.body_html ?? ''
    if (payload.digest_html) bodyHtml = replaceSection(bodyHtml, 'digest', payload.digest_html)
    if (payload.practice_html) bodyHtml = replaceSection(bodyHtml, 'practice', payload.practice_html)
    // CTA gets rebuilt from the current blog_slug too — older issues
    // created before PR #75 might not have a cta_article section yet;
    // replaceSection's fallback path appends it before signoff.
    const ctaHtml = buildArticleCta(article.blog_slug)
    if (ctaHtml) bodyHtml = replaceSection(bodyHtml, 'cta_article', ctaHtml)

    const { data: updated, error: updErr } = await supabaseAdmin
      .from('nl_issues')
      .update({ body_html: bodyHtml, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, body_html, version')
      .single()
    if (updErr || !updated) {
      return NextResponse.json({ error: updErr?.message ?? 'Не удалось сохранить' }, { status: 500 })
    }

    return NextResponse.json({
      issue: updated,
      sectionsRegenerated: {
        digest: Boolean(payload.digest_html),
        practice: Boolean(payload.practice_html),
        cta_article: Boolean(ctaHtml),
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка регенерации'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
