// HTML Formatter agent — applies publication markup to stylistically-ready text.
// Input: plain text (stylistically polished). Output: HTML with h2/blockquote/insight/qblock.
// Streams chunks to the client so Safari's ~60s fetch timeout doesn't abort the
// connection on long articles (same pattern as style-edit, B-07).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'
import { FORMATTER_PROMPT } from '@/lib/articles/prompts'

const anthropic = new Anthropic()

export const maxDuration = 180
export const dynamic = 'force-dynamic'

interface StructureRequest {
  text: string
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { text }: StructureRequest = await req.json()

  if (!text?.trim()) {
    return NextResponse.json({ error: 'Пустой текст' }, { status: 400 })
  }

  console.log(`[structure] received ${text.length} chars`)
  const start = Date.now()

  const encoder = new TextEncoder()
  let produced = 0

  // Markup-only job: no extended thinking here — the model just applies tags
  // to existing text, so there's nothing to plan. 16k output caps any
  // reasonable article size.
  const MAX_TOKENS = 16000

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Immediate keepalive so Safari/nginx see bytes before Anthropic responds.
      controller.enqueue(encoder.encode('\u200B'))

      try {
        const stream = anthropic.messages.stream({
          model: AI_MODELS.claude,
          max_tokens: MAX_TOKENS,
          system: FORMATTER_PROMPT,
          messages: [{ role: 'user', content: text }],
        })

        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta' &&
            event.delta.text
          ) {
            produced += event.delta.text.length
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }

        console.log(`[structure] done in ${((Date.now() - start) / 1000).toFixed(1)}s, output ${produced} chars`)
        controller.close()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Ошибка форматирования'
        console.error('[structure] error:', msg)
        controller.enqueue(encoder.encode(`\n\n[[STRUCTURE_ERROR]] ${msg}`))
        controller.close()
      }
    },
  })

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
