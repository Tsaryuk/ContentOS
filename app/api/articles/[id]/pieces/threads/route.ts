/**
 * POST /api/articles/[id]/pieces/threads
 * Generate 5-7 Threads post candidates from the article body using the
 * @thedankoe-style prompt. Saves result as a content_pieces row
 * (kind='threads') with the candidate list in metadata.
 *
 * GET /api/articles/[id]/pieces/threads
 * Returns the most recent generation (all candidates + chosen text) for UI.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { handleApiError } from '@/lib/api-error'
import { trackUsage } from '@/lib/cost'
import { AI_MODELS } from '@/lib/ai-models'
import { buildThreadsSystemPrompt, buildThreadsUserPrompt } from '@/lib/content/threads-prompt'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

interface ThreadsCandidate {
  hook: string
  body: string
  closing: string
  seed_idea: string
  full_text?: string    // computed client-side for copy buttons
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
      max_tokens: 4096,
      system: buildThreadsSystemPrompt(),
      messages: [{ role: 'user', content: buildThreadsUserPrompt(article.title, article.body_html) }],
    })

    trackUsage({
      provider: 'anthropic',
      model: AI_MODELS.claude,
      task: 'telegram_generate',   // reuse existing enum; Threads isn't a separate Task yet
      inputTokens:  (response as unknown as { usage?: { input_tokens?: number } })?.usage?.input_tokens,
      outputTokens: (response as unknown as { usage?: { output_tokens?: number } })?.usage?.output_tokens,
      userId: auth.userId,
      metadata: { kind: 'threads', article_id: articleId },
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as { text: string }).text)
      .join('')

    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Модель вернула ответ в неожиданном формате' }, { status: 500 })
    }

    let candidates: ThreadsCandidate[]
    try {
      candidates = JSON.parse(jsonMatch[0])
    } catch {
      return NextResponse.json({ error: 'Не удалось распарсить ответ модели' }, { status: 500 })
    }

    // Compute full_text for copy-to-clipboard convenience
    candidates = candidates.map(c => ({
      ...c,
      full_text: [c.hook, c.body, c.closing].filter(Boolean).join('\n\n'),
    }))

    // Persist as a new content_piece
    const { data: piece, error: pieceErr } = await supabaseAdmin
      .from('content_pieces')
      .insert({
        article_id: articleId,
        kind: 'threads',
        status: 'draft',
        content: null,        // user selects one candidate later → content set then
        metadata: { candidates, generated_at: new Date().toISOString() },
        created_by: auth.userId,
      })
      .select()
      .single()

    if (pieceErr) {
      return NextResponse.json({ error: pieceErr.message }, { status: 500 })
    }

    return NextResponse.json({ piece, candidates })
  } catch (err: unknown) {
    return handleApiError(err, { route: '/api/articles/[id]/pieces/threads (POST)', userId: auth.userId, extra: { articleId } })
  }
}

// Latest generation for this article (so page can show previous results on reload).
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
    .eq('kind', 'threads')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ piece: data?.[0] ?? null })
}
