import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'
import { NEWSLETTER_SYSTEM_PROMPT, buildChatUserPrompt } from '@/lib/newsletter/prompts'

const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { issue_id, message, current_html, selected_text } = await req.json()

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Введите сообщение' }, { status: 400 })
    }

    // Load chat history if issue exists
    let history: Array<{ role: 'user' | 'assistant'; content: string }> = []
    if (issue_id) {
      const { data: messages } = await supabaseAdmin
        .from('nl_ai_messages')
        .select('role, content')
        .eq('issue_id', issue_id)
        .order('created_at', { ascending: true })
        .limit(20)

      if (messages) {
        history = messages as typeof history
      }
    }

    const userContent = buildChatUserPrompt({
      message,
      currentHtml: current_html,
      selectedText: selected_text,
    })

    const allMessages = [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: userContent },
    ]

    const response = await anthropic.messages.create({
      model: AI_MODELS.claude,
      max_tokens: 4096,
      system: NEWSLETTER_SYSTEM_PROMPT,
      messages: allMessages,
    })

    const content = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    // Save messages to history
    if (issue_id) {
      await supabaseAdmin.from('nl_ai_messages').insert([
        { issue_id, role: 'user', content: message },
        { issue_id, role: 'assistant', content },
      ])
    }

    return NextResponse.json({ content })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка AI'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
