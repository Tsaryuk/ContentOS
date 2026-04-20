// Stylistic editor — white paper agent
// Takes raw author text, returns stylistically-improved plain text (NO HTML).
// Streams chunks back to the client so Safari's ~60s fetch timeout doesn't
// abort the connection on long generations (B-07).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'
import { STYLE_EDITOR_PROMPT } from '@/lib/articles/prompts'

const anthropic = new Anthropic()

export const maxDuration = 180
export const dynamic = 'force-dynamic'

interface StyleEditRequest {
  text: string
  instruction?: string // optional user note: "make it shorter", "add more examples"
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { text, instruction }: StyleEditRequest = await req.json()

  if (!text?.trim()) {
    return NextResponse.json({ error: 'Пустой текст' }, { status: 400 })
  }

  console.log(`[style-edit] received ${text.length} chars${instruction ? `, note: "${instruction.slice(0, 60)}"` : ''}`)
  const start = Date.now()

  const userMessage = instruction?.trim()
    ? `Замечание автора: ${instruction}\n\n---ТЕКСТ---\n\n${text}`
    : text

  const encoder = new TextEncoder()
  let produced = 0
  let thinkingChars = 0

  // Extended thinking: model first analyzes the whole article and plans the
  // structure, then writes the final text. Thinking budget eats from
  // max_tokens, so MAX_TOKENS must cover both phases comfortably.
  // 16k leaves ~8k for the rewritten article — a Dan Koe-length post is
  // ~3-5k output tokens, so plenty of headroom without bumping into the
  // non-beta output cap.
  const THINKING_BUDGET = 8000
  const MAX_TOKENS = 16000

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Send an immediate keepalive byte so Safari/nginx don't consider
      // the connection idle while Anthropic is still thinking.
      controller.enqueue(encoder.encode('\u200B')) // zero-width space, trimmed on client

      try {
        const stream = anthropic.messages.stream({
          model: AI_MODELS.claude,
          max_tokens: MAX_TOKENS,
          thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
          system: STYLE_EDITOR_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
        })

        for await (const event of stream) {
          if (event.type !== 'content_block_delta') continue

          if (event.delta.type === 'thinking_delta' && event.delta.thinking) {
            // Don't forward thinking content to the client, but emit a
            // keepalive byte so Safari's ~60s fetch timeout resets while
            // the model is still reasoning through the whole article.
            thinkingChars += event.delta.thinking.length
            controller.enqueue(encoder.encode('\u200B'))
            continue
          }

          if (event.delta.type === 'text_delta' && event.delta.text) {
            produced += event.delta.text.length
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }

        console.log(`[style-edit] done in ${((Date.now() - start) / 1000).toFixed(1)}s, thinking ${thinkingChars} chars, output ${produced} chars`)
        controller.close()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Ошибка стилистической правки'
        console.error('[style-edit] error:', msg)
        // Send an error marker the client can detect; trailers aren't portable.
        controller.enqueue(encoder.encode(`\n\n[[STYLE_EDIT_ERROR]] ${msg}`))
        controller.close()
      }
    },
  })

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no', // nginx: stream immediately, don't buffer
    },
  })
}
