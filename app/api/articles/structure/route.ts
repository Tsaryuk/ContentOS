// Structure raw article text into formatted HTML with proper headings, quotes, insights
// Used by the white paper editor to transform plain longform text into publication-ready article

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'

const anthropic = new Anthropic()

export const maxDuration = 180
export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `Ты редактор-оформитель лонгридов для блога «Личная Стратегия» (автор Денис Царюк).
Задача: взять сырой текст автора и структурировать его в публикуемую HTML-статью.

## Стиль блога
- Философский лонгрид, длинные размышления, личный опыт
- Тон: тёплый, прямой, без инфобизнесной риторики
- Аудитория: думающие люди 30-45, предприниматели, русскоговорящие
- Нельзя: достигаторство, «5 шагов к успеху», пустые обещания, корпоративщина

## Что делать с текстом
1. **НЕ МЕНЯТЬ слова автора** — только разбивать на разделы, добавлять разметку
2. Разбить на логичные разделы с заголовками <h2> (короткие, 3-6 слов)
3. Найти ключевые цитатные мысли → <blockquote>
4. Найти главную мысль статьи → блок insight (div class="insight")
5. Найти главный вопрос / призыв к размышлению → блок qblock (div class="qblock")
6. Выделить <strong> в самых важных фразах (по 1-2 на раздел)
7. Сохранить все абзацы автора как <p>
8. Разделители <hr class="divider"> между крупными смысловыми блоками

## HTML-разметка (используй ТОЛЬКО эти теги)
- Абзац: <p>текст</p>
- Подзаголовок: <h2>ТЕКСТ</h2>
- Цитата: <blockquote>текст<cite>— автор (если указан)</cite></blockquote>
- Жирный: <strong>текст</strong>
- Инсайт (главная мысль):
  <div class="insight"><div class="ins-label">Главная мысль</div><p class="ins-text">текст</p></div>
- Вопрос недели:
  <div class="qblock"><div class="q-label">Вопрос для размышления</div><div class="q-text">текст</div></div>
- Разделитель: <hr class="divider">

## Что НЕ делать
- Не добавляй и не сокращай авторский текст
- Не используй буллет-поинты и нумерованные списки
- Не добавляй "Введение", "Заключение", "Итак" и прочие клише
- Не вставляй markdown (только HTML)
- Не оборачивай ответ в <html>, <body>, <article> — только содержимое body

## Формат ответа
Только чистый HTML статьи, без пояснений, без markdown-блоков, без комментариев.`

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
      system: SYSTEM_PROMPT,
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

    // Strip markdown code fences if Claude wrapped the response
    html = html.replace(/^```html?\n?/i, '').replace(/\n?```$/i, '').trim()

    console.log(`[structure] done in ${((Date.now()-start)/1000).toFixed(1)}s, output ${html.length} chars`)

    return NextResponse.json({ html })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка структурирования'
    console.error('[structure] error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
