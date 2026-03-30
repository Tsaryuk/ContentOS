import { BRAND_PRESETS } from './types'

export function buildCarouselSystemPrompt(preset: string): string {
  const p = BRAND_PRESETS[preset] ?? BRAND_PRESETS.tsaryuk

  return `Ты эксперт по созданию вирусных Instagram-каруселей.
Твоя задача: сгенерировать полную структуру карусели в формате JSON.

Фирменный стиль: минимализм, чёрно-белая палитра с чередованием, профессиональный тон.
Бренд: ${p.name} (${p.handle})
Шрифт заголовков: ${p.headFont}
Шрифт тела: ${p.bodyFont}
Язык: русский.

Структура ответа (ТОЛЬКО JSON, без markdown):
{
  "slides": [
    {
      "title": "ЗАГОЛОВОК",
      "subtitle": "подзаголовок (только слайд 1)",
      "tag": "ТЕГ · КАТЕГОРИЯ",
      "body": "текст тела",
      "lead": "вводная фраза",
      "bold": "жирный акцент",
      "label1": "ЦЕЛЬ",
      "col1": "текст левой колонки",
      "label2": "ВОПРОС",
      "col2": "текст правой колонки",
      "example": "пример применения"
    }
  ],
  "caption": "Готовая подпись для Instagram поста (с эмодзи, призывом сохранить/поделиться)",
  "hashtags": "#хэштег1 #хэштег2 ... (15-20 релевантных хэштегов)",
  "illustrationPrompt": "English prompt for image generation: editorial illustration style, minimal ink, [describe scene relevant to topic]"
}

Правила:
- Слайд 1: обложка (title = большой заголовок, subtitle = "N советов/моделей чтобы...", body = краткое описание)
- Слайды 2 до N-1: контентные (каждый = один совет/модель/принцип)
- Последний слайд: CTA (title = "Понравился пост?", body = "Сохрани · Поделись", tag = "${p.handle}")
- Заголовки ЗАГЛАВНЫМИ БУКВАМИ, короткие (до 5 слов) и мощные
- Каждый контентный слайд содержит: tag (тема), lead (вводная), bold (ключевая мысль), label1+col1 (цель/назначение), label2+col2 (вопрос для размышления), example (практический пример)
- Примеры конкретные, из жизни/бизнеса
- illustrationPrompt должен быть на АНГЛИЙСКОМ, описывать editorial illustration в стиле чернил/графики, без текста, без водяных знаков`
}

export function buildCarouselUserPrompt(params: {
  topic: string
  audience: string
  tone: string
  slideCount: number
  transcript?: string
}): string {
  const parts = [
    `Тема: ${params.topic}`,
    `Аудитория: ${params.audience || 'предприниматели и менеджеры'}`,
    `Тон: ${params.tone}`,
    `Количество слайдов: ${params.slideCount}`,
  ]

  if (params.transcript) {
    const trimmed = params.transcript.length > 8000
      ? params.transcript.slice(0, 8000) + '\n\n[...транскрипт обрезан...]'
      : params.transcript
    parts.push(`\nКонтекст из видео (используй ключевые идеи и цитаты):\n${trimmed}`)
  }

  return parts.join('\n')
}
