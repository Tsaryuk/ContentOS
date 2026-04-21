/**
 * POST /api/articles/[id]/pieces/video-script
 * Generate a continuous teleprompter script from the article for
 * «Денис Царюк / Личная стратегия» YouTube channel.
 *
 * GET — latest generation for this article.
 *
 * Response streams: the Anthropic call can take >60s on a long article,
 * which Safari's default fetch timeout silently aborts ("Load failed").
 * We stream zero-width-space keepalive bytes while Claude is running, then
 * emit the final {piece} (or {error}) JSON as the last payload. Client
 * reads the whole body, strips ZWSP, parses JSON from the tail.
 */

export const maxDuration = 180
export const dynamic = 'force-dynamic'

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

interface Chunk {
  title: string
  text: string
  estimated_minutes: number
}

interface VideoScript {
  hook: string
  chunks?: Chunk[]
  script?: string     // legacy single-block fallback
  closing_line: string
  estimated_minutes: number
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id: articleId } = await params

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

  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Immediate keepalive + 10s heartbeat so Safari and any intermediate
      // proxy keep the connection open until we write the real result.
      controller.enqueue(encoder.encode('\u200B'))
      const heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode('\u200B')) } catch { /* closed */ }
      }, 10_000)

      const finish = (payload: Record<string, unknown>): void => {
        clearInterval(heartbeat)
        try {
          controller.enqueue(encoder.encode('\n' + JSON.stringify(payload)))
        } catch { /* closed */ }
        try { controller.close() } catch { /* already closed */ }
      }

      try {
        const response = await anthropic.messages.create({
          model: AI_MODELS.claude,
          max_tokens: 8192,
          system: buildVideoScriptSystemPrompt(),
          messages: [{ role: 'user', content: buildVideoScriptUserPrompt(article.title, article.body_html) }],
        })

        trackUsage({
          provider: 'anthropic',
          model: AI_MODELS.claude,
          task: 'article_structure',
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
          finish({ error: 'Модель вернула ответ в неожиданном формате' })
          return
        }

        let result: VideoScript
        try {
          result = JSON.parse(jsonMatch[0])
        } catch {
          finish({ error: 'Не удалось распарсить ответ модели' })
          return
        }

        // Backward-compat: older prompt variants returned a single `script`.
        const chunks = result.chunks ?? (result.script
          ? [{ title: 'Сценарий', text: result.script, estimated_minutes: result.estimated_minutes }]
          : [])

        const fullScript = chunks.map(c => c.text).join('\n\n')
        const totalWords = fullScript.split(/\s+/).filter(Boolean).length

        const { data: piece, error: pieceErr } = await supabaseAdmin
          .from('content_pieces')
          .insert({
            article_id: articleId,
            kind: 'video_script',
            status: 'draft',
            content: fullScript,
            metadata: {
              hook: result.hook,
              closing_line: result.closing_line,
              estimated_minutes: result.estimated_minutes,
              word_count: totalWords,
              chunks,
              generated_at: new Date().toISOString(),
            },
            created_by: auth.userId,
          })
          .select()
          .single()

        if (pieceErr) { finish({ error: pieceErr.message }); return }
        finish({ piece })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Ошибка генерации'
        // Run same structured error handler for monitoring; we still return
        // the error body through the stream so the client can display it.
        handleApiError(err, {
          route: '/api/articles/[id]/pieces/video-script (POST)',
          userId: auth.userId,
          extra: { articleId },
        })
        finish({ error: msg })
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
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
