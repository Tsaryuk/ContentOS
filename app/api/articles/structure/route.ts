// HTML Formatter agent — applies publication markup to stylistically-ready text
// Input: plain text (stylistically polished). Output: HTML with h2/blockquote/insight/qblock.

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { text }: StructureRequest = await req.json()

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Пустой текст' }, { status: 400 })
    }

    console.log(`[structure] received ${text.length} chars`)
    const start = Date.now()

    const response = await anthropic.messages.create({
      model: AI_MODELS.claude,
      max_tokens: 8192,
      system: FORMATTER_PROMPT,
      messages: [{
        role: 'user',
        content: text,
      }],
    })

    let html = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim()

    console.log(`[structure] done in ${((Date.now()-start)/1000).toFixed(1)}s, output ${html.length} chars`)

    return NextResponse.json({ html })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка форматирования'
    console.error('[structure] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
