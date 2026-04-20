// Wizard endpoint that fills one interactive section of a newsletter email.
// The frontend chat sends the user's raw answer to the wizard question
// (URL + context for philosophy / free text for lifehack / topic for anons);
// the server rewrites it in Denis's voice via Claude, replaces the target
// <section data-kind="..."> inside body_html, and persists the result.
//
// Streaming: the rewrite is short (~150-400 words) so we keep a synchronous
// request — well below Safari's ~60s fetch timeout.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'
import { replaceSection } from '@/lib/newsletter/sections'
import {
  getWizardPrompt,
  type WizardSectionKind,
} from '@/lib/newsletter/wizard-prompts'

const anthropic = new Anthropic()

const WIZARD_KINDS = new Set<WizardSectionKind>(['philosophy', 'lifehack', 'anons'])

interface FillSectionRequest {
  kind: WizardSectionKind
  user_input: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  const body = (await req.json()) as Partial<FillSectionRequest>

  const kind = body.kind
  const userInput = body.user_input?.trim()

  if (!kind || !WIZARD_KINDS.has(kind)) {
    return NextResponse.json(
      { error: 'kind must be one of: philosophy, lifehack, anons' },
      { status: 400 },
    )
  }
  if (!userInput) {
    return NextResponse.json({ error: 'user_input обязателен' }, { status: 400 })
  }

  // Load current issue so we can update only the target section.
  const { data: issue, error: loadErr } = await supabaseAdmin
    .from('nl_issues')
    .select('id, body_html')
    .eq('id', id)
    .single()

  if (loadErr || !issue) {
    return NextResponse.json({ error: 'Выпуск не найден' }, { status: 404 })
  }

  try {
    const response = await anthropic.messages.create({
      model: AI_MODELS.claude,
      max_tokens: 2000,
      system: getWizardPrompt(kind),
      messages: [
        {
          role: 'user',
          content: userInput,
        },
      ],
    })

    const rawHtml = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim()

    if (!rawHtml) {
      return NextResponse.json(
        { error: 'Модель вернула пустой результат' },
        { status: 500 },
      )
    }

    // Strip accidental code fences the model sometimes adds.
    const sectionHtml = rawHtml
      .replace(/^```html?\n?/i, '')
      .replace(/\n?```$/i, '')
      .trim()

    const nextBodyHtml = replaceSection(issue.body_html ?? '', kind, sectionHtml)

    const { error: updateErr } = await supabaseAdmin
      .from('nl_issues')
      .update({
        body_html: nextBodyHtml,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      kind,
      section_html: sectionHtml,
      body_html: nextBodyHtml,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка генерации'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
