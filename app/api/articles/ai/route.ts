import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'

const anthropic = new Anthropic()

const SYSTEM_PROMPT = `Ты — AI-ассистент Дениса Царюка, помогаешь писать статьи для блога «Личная Стратегия».

## Стиль автора
- Пишет от первого лица, из личного опыта, не сверху вниз
- Тон: тёплый, прямой, без инфобизнесной риторики
- Провокационный заголовок + честный разговор
- Аудитория: предприниматели 30–45 лет, думающие люди
- Избегает: достигаторство, «5 шагов к успеху», пустые обещания
- Любит: парадоксы, честные противоречия, вопросы без готовых ответов

## Структура статьи
1. Заголовок — провокационный, цепляющий
2. Подзаголовок — интрига или вопрос
3. Вступление — 2-3 абзаца, личное наблюдение
4. 2-3 раздела с подзаголовками <h2>
5. Цитаты в <blockquote>
6. Ключевые мысли выделять <strong>
7. Блок "Главная мысль" (div class="insight")
8. "Вопрос для размышления" (div class="qblock")
9. YouTube видео — placeholder для embed
10. Практическое задание

## HTML-разметка
- Подзаголовки: <h2>ТЕКСТ</h2>
- Цитаты: <blockquote>текст<cite>— автор</cite></blockquote>
- Инсайт: <div class="insight"><div class="ins-label">Главная мысль</div><p class="ins-text">текст</p></div>
- Вопрос: <div class="qblock"><div class="q-label">Вопрос для размышления</div><div class="q-text">текст</div></div>
- Разделитель: <hr class="divider">

## Правила
- Пиши на русском
- Без буллет-поинтов в основном тексте — только абзацы
- Длина: 1500–3000 слов
- Каждый раздел 3-5 абзацев
- Отвечай в HTML если просят контент, в чистом тексте если обсуждение`

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { article_id, message, current_html, selected_text } = await req.json()

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Введите сообщение' }, { status: 400 })
    }

    let history: Array<{ role: 'user' | 'assistant'; content: string }> = []
    if (article_id) {
      const { data: messages } = await supabaseAdmin
        .from('nl_article_messages')
        .select('role, content')
        .eq('article_id', article_id)
        .order('created_at', { ascending: true })
        .limit(20)
      if (messages) history = messages as typeof history
    }

    let userContent = message
    if (selected_text) userContent += `\n\n--- Выделенный фрагмент ---\n${selected_text}`
    if (current_html) {
      const textOnly = current_html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      if (textOnly.length > 0) userContent += `\n\n--- Текущий текст ---\n${textOnly.slice(0, 3000)}`
    }

    const allMessages = [
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user' as const, content: userContent },
    ]

    const response = await anthropic.messages.create({
      model: AI_MODELS.claude,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: allMessages,
    })

    const content = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')

    if (article_id) {
      await supabaseAdmin.from('nl_article_messages').insert([
        { article_id, role: 'user', content: message },
        { article_id, role: 'assistant', content },
      ])
    }

    return NextResponse.json({ content })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка AI'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
