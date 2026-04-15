// Stylistic editor — white paper agent
// Takes raw author text, returns stylistically-improved plain text (NO HTML)

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { text, instruction }: StyleEditRequest = await req.json()

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Пустой текст' }, { status: 400 })
    }

    console.log(`[style-edit] received ${text.length} chars${instruction ? `, note: "${instruction.slice(0, 60)}"` : ''}`)
    const start = Date.now()

    const userMessage = instruction?.trim()
      ? `Замечание автора: ${instruction}\n\n---ТЕКСТ---\n\n${text}`
      : text

    const response = await anthropic.messages.create({
      model: AI_MODELS.claude,
      max_tokens: 8192,
      system: STYLE_EDITOR_PROMPT,
      messages: [{
        role: 'user',
        content: userMessage,
      }],
    })

    const improved = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    console.log(`[style-edit] done in ${((Date.now()-start)/1000).toFixed(1)}s, output ${improved.length} chars`)

    return NextResponse.json({ text: improved })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка стилистической правки'
    console.error('[style-edit] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
