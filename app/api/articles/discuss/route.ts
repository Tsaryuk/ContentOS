// Dialogue endpoint for the Чистый лист writing mode (E2).
//
// Two actions on the same route:
//   - next_question: sync call, AI reads the draft + Q&A history and returns
//     one targeted question the author should answer.
//   - integrate:     streaming call, AI rewrites the draft weaving the
//     collected answers in. Streams identically to /api/articles/style-edit
//     (zero-width keepalive + text chunks + trailing error marker) so Safari
//     doesn't cut off the fetch while Claude is still writing.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'
import {
  DISCUSS_QUESTION_PROMPT,
  DISCUSS_INTEGRATE_PROMPT,
} from '@/lib/articles/discuss-prompts'

const anthropic = new Anthropic()

export const maxDuration = 180
export const dynamic = 'force-dynamic'

interface DiscussMessage {
  role: 'user' | 'assistant'
  content: string
}

interface DiscussRequest {
  action: 'next_question' | 'integrate'
  text: string
  messages?: DiscussMessage[]
}

function buildContext(text: string, messages: DiscussMessage[]): string {
  const thread = messages.length
    ? messages
        .map((m) => `${m.role === 'user' ? 'АВТОР' : 'РЕДАКТОР'}: ${m.content}`)
        .join('\n\n')
    : '(диалог пока пустой)'
  return `## ТЕКУЩИЙ ТЕКСТ ЧЕРНОВИКА\n\n${text}\n\n## ДИАЛОГ ДО СИХ ПОР\n\n${thread}`
}

export async function POST(req: NextRequest): Promise<Response> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const body = (await req.json()) as Partial<DiscussRequest>
  const action = body.action
  const text = body.text?.trim() ?? ''
  const messages = Array.isArray(body.messages) ? body.messages : []

  if (action !== 'next_question' && action !== 'integrate') {
    return NextResponse.json(
      { error: 'action must be next_question or integrate' },
      { status: 400 },
    )
  }
  if (!text) {
    return NextResponse.json({ error: 'Пустой черновик — сначала напиши что-нибудь' }, { status: 400 })
  }

  const userContent = buildContext(text, messages)

  if (action === 'next_question') {
    try {
      const response = await anthropic.messages.create({
        model: AI_MODELS.claude,
        max_tokens: 400,
        system: DISCUSS_QUESTION_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      })
      const question = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim()
      if (!question) {
        return NextResponse.json({ error: 'Модель вернула пустой вопрос' }, { status: 500 })
      }
      return NextResponse.json({ question })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка'
      console.error('[discuss:next_question]', msg)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  // action === 'integrate' — stream, same pattern as /api/articles/style-edit
  console.log(`[discuss:integrate] text=${text.length} chars, messages=${messages.length}`)
  const start = Date.now()
  const encoder = new TextEncoder()
  let produced = 0

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode('\u200B')) // initial keepalive
      try {
        const claudeStream = anthropic.messages.stream({
          model: AI_MODELS.claude,
          max_tokens: 16000,
          system: DISCUSS_INTEGRATE_PROMPT,
          messages: [{ role: 'user', content: userContent }],
        })

        for await (const event of claudeStream) {
          if (event.type !== 'content_block_delta') continue
          if (event.delta.type === 'text_delta' && event.delta.text) {
            produced += event.delta.text.length
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
        console.log(`[discuss:integrate] done ${((Date.now() - start) / 1000).toFixed(1)}s, ${produced} chars`)
        controller.close()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Ошибка интеграции'
        console.error('[discuss:integrate]', msg)
        controller.enqueue(encoder.encode(`\n\n[[DISCUSS_ERROR]] ${msg}`))
        controller.close()
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
