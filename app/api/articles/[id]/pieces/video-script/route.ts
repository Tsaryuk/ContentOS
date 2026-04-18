/**
 * POST /api/articles/[id]/pieces/video-script
 * Generate a continuous teleprompter script from the article for
 * «Денис Царюк / Личная стратегия» YouTube channel.
 *
 * GET — latest generation for this article.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { handleApiError } from '@/lib/api-error'
import { trackUsage } from '@/lib/cost'
import { AI_MODELS } from '@/lib/ai-models'
import {
  buildVideoScriptSystemPrompt,
  buildVideoScriptUserPrompt,
} from '@/lib/content/video-script-prompt'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

interface VideoScript {
  hook: string
  script: string
  closing_line: string
  estimated_minutes: number
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id: articleId } = await params

  try {
    const { data: article, error: artErr } = await supabaseAdmin
      .from('nl_articles')
      .select('id, title, body_html')
      .eq('id', articleId)
      .single()

    if (artErr || !article) {
      return NextResponse.json({ error: 'Статья не найдена' }, { status: 404 })
    }
    if (!article.body_html?.trim()) {
      return NextResponse.json({ error: 'Статья пустая — нечего генерировать' }, { status: 400 })
    }

    const response = await anthropic.messages.create({
      model: AI_MODELS.claude,
      max_tokens: 8192,
      system: buildVideoScriptSystemPrompt(),
      messages: [{ role: 'user', content: buildVideoScriptUserPrompt(article.title, article.body_html) }],
    })

    trackUsage({
      provider: 'anthropic',
      model: AI_MODELS.claude,
      task: 'article_structure',  // reuse existing enum for article-adjacent tasks
      inputTokens:  (response as unknown as { usage?: { input_tokens?: number } })?.usage?.input_tokens,
      outputTokens: (response as unknown as { usage?: { output_tokens?: number } })?.usage?.output_tokens,
      userId: auth.userId,
      metadata: { kind: 'video_script', article_id: articleId },
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('')

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Модель вернула ответ в неожиданном формате' }, { status: 500 })
    }

    let result: VideoScript
    try {
      result = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Не удалось распарсить ответ модели' }, { status: 500 })
    }

    const { data: piece, error: pieceErr } = await supabaseAdmin
      .from('content_pieces')
      .insert({
        article_id: articleId,
        kind: 'video_script',
        status: 'draft',
        content: result.script,
        metadata: {
          hook: result.hook,
          closing_line: result.closing_line,
          estimated_minutes: result.estimated_minutes,
          word_count: result.script?.split(/\s+/).filter(Boolean).length ?? 0,
          generated_at: new Date().toISOString(),
        },
        created_by: auth.userId,
      })
      .select()
      .single()

    if (pieceErr) return NextResponse.json({ error: pieceErr.message }, { status: 500 })
    return NextResponse.json({ piece })
  } catch (err: unknown) {
    return handleApiError(err, { route: '/api/articles/[id]/pieces/video-script (POST)', userId: auth.userId, extra: { articleId } })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id: articleId } = await params

  const { data, error } = await supabaseAdmin
    .from('content_pieces')
    .select('*')
    .eq('article_id', articleId)
    .eq('kind', 'video_script')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ piece: data?.[0] ?? null })
}
