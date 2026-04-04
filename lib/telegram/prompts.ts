/**
 * System and user prompts for Telegram AI features.
 */

export function buildTelegramGenerateSystemPrompt(channelTitle: string): string {
  return `Ты — эксперт по контент-маркетингу в Telegram.
Канал: "${channelTitle}".

ПРАВИЛА:
1. Пиши живо, без канцеляризмов и «воды».
2. Первое предложение — хук: цепляющий факт, вопрос или провокация.
3. Абзацы 2–3 предложения. Между абзацами — пустая строка.
4. Используй эмодзи умеренно (1–2 на абзац, не в каждом).
5. Добавь call-to-action в конце (вопрос, голосование, ссылка).
6. Длина: 500–1500 символов (оптимум для Telegram).
7. Если пост связан с видео — упомяни ключевые инсайты, но не дублируй описание.
8. Формат: HTML (Telegram поддерживает <b>, <i>, <a>, <code>, <pre>).

ВАЖНО: верни ТОЛЬКО текст поста, без пояснений и обёрток.`
}

export function buildTelegramGenerateUserPrompt(params: {
  topic?: string
  videoTitle?: string
  videoDescription?: string
  tone?: string
}): string {
  const parts: string[] = []

  if (params.videoTitle) {
    parts.push(`Создай Telegram-пост для анонса видео: "${params.videoTitle}"`)
    if (params.videoDescription) {
      parts.push(`Описание видео: ${params.videoDescription.slice(0, 1000)}`)
    }
  } else if (params.topic) {
    parts.push(`Создай Telegram-пост на тему: ${params.topic}`)
  } else {
    parts.push('Создай интересный пост для Telegram-канала.')
  }

  if (params.tone) {
    parts.push(`Тон: ${params.tone}`)
  }

  return parts.join('\n\n')
}

export function buildTelegramSuggestSystemPrompt(): string {
  return `Ты — AI-стратег по контент-планированию для Telegram.

Твоя задача: проанализировать контекст (последние посты, видео в работе, задачи) и дать конкретные рекомендации.

ФОРМАТ ОТВЕТА — JSON:
{
  "suggestions": [
    {
      "type": "post_idea" | "timing" | "format" | "engagement",
      "title": "Краткий заголовок",
      "description": "Подробное описание рекомендации",
      "priority": "high" | "medium" | "low"
    }
  ]
}

ПРАВИЛА:
- 3–5 рекомендаций, отсортированных по приоритету
- Конкретные, actionable советы
- Учитывай частоту постинга, темы, время публикации
- Если есть видео в pipeline — предложи анонс/тизер

Верни ТОЛЬКО JSON, без markdown-обёрток.`
}

export function buildTelegramSuggestUserPrompt(context: {
  recentPosts: { content: string; sent_at: string | null }[]
  upcomingVideos: { title: string; status: string }[]
  channelTitle: string
}): string {
  const parts = [`Канал: "${context.channelTitle}"`]

  if (context.recentPosts.length > 0) {
    parts.push('ПОСЛЕДНИЕ ПОСТЫ:')
    for (const p of context.recentPosts.slice(0, 5)) {
      parts.push(`- [${p.sent_at ?? 'draft'}] ${p.content.slice(0, 200)}...`)
    }
  } else {
    parts.push('Постов пока нет — канал новый.')
  }

  if (context.upcomingVideos.length > 0) {
    parts.push('\nВИДЕО В PIPELINE:')
    for (const v of context.upcomingVideos.slice(0, 5)) {
      parts.push(`- [${v.status}] ${v.title}`)
    }
  }

  parts.push('\nДай рекомендации по контент-плану.')
  return parts.join('\n')
}
