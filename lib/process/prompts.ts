import type { ChannelRules, ExtendedChannelRules, GuestInfo } from './types'

export function buildSystemPrompt(rules: ChannelRules): string {
  return `Ты — AI-ассистент YouTube-канала. Твоя задача — оптимизировать метаданные видео на основе транскрипта.

## Правила канала

### Формат заголовка
${rules.title_format}

### Шаблон описания
${rules.description_template}

### Обязательные ссылки (добавить в конец описания)
${rules.required_links.map(l => `- ${l}`).join('\n')}

### Фиксированные хештеги (добавить в конец описания)
${rules.hashtags_fixed.join(' ')}

### Нарезка
- Количество shorts: ${rules.shorts_count}
- Максимальная длина клипа: ${rules.clip_max_minutes} минут

## Формат ответа

Верни ТОЛЬКО валидный JSON (без markdown, без \`\`\`):
{
  "title": "Новый заголовок по формату канала",
  "description": "Полное описание по шаблону с ссылками и хештегами",
  "tags": ["тег1", "тег2", "...до 15 тегов"],
  "timecodes": [
    {"time": "00:00", "label": "Начало"},
    {"time": "MM:SS", "label": "Краткое описание сегмента"}
  ],
  "clips": [
    {
      "start": 120,
      "end": 180,
      "title": "Название клипа для short",
      "type": "short"
    },
    {
      "start": 300,
      "end": 900,
      "title": "Название сегмента для клипа",
      "type": "clip"
    }
  ],
  "ai_score": 85
}

## Правила генерации

1. **Заголовок**: Отрази суть видео. Используй формат канала. Макс 100 символов.
2. **Описание**: Заполни шаблон реальным контентом из транскрипта. Добавь тайм-коды. Добавь ссылки и хештеги в конец.
3. **Теги**: Релевантные теме, включая фиксированные хештеги без #. До 15 штук.
4. **Тайм-коды**: Определи ключевые моменты из транскрипта. Минимум 5 тайм-кодов для видео >10 минут.
5. **Клипы**: Найди ${rules.shorts_count} ярких моментов для shorts (до 60 сек) и 1-2 клипа (до ${rules.clip_max_minutes} мин).
6. **ai_score**: Оценка качества контента 0-100. Учитывай: структурированность, глубину темы, engagement potential.`
}

export function buildUserPrompt(params: {
  currentTitle: string
  currentDescription: string
  transcript: string
  durationSeconds: number
}): string {
  const durationMin = Math.round(params.durationSeconds / 60)

  // Truncate transcript if too long (Claude has limits)
  const maxTranscriptLength = 100000
  const transcript = params.transcript.length > maxTranscriptLength
    ? params.transcript.slice(0, maxTranscriptLength) + '\n\n[...транскрипт обрезан из-за длины...]'
    : params.transcript

  return `## Текущие данные видео

**Заголовок:** ${params.currentTitle}
**Длительность:** ${durationMin} минут
**Текущее описание:** ${params.currentDescription || '(пусто)'}

## Транскрипт

${transcript}

---

Сгенерируй оптимизированные метаданные для этого видео в формате JSON.`
}

// --- Producer Agent Prompts ---

export function buildProducerSystemPrompt(rules: ExtendedChannelRules, durationMin: number): string {
  const timecodesCount = durationMin > 60 ? 20 : durationMin > 30 ? 15 : 10

  const clipRules = rules.clip_rules ?? {
    title_format: 'Кликбейтный hook — суть сегмента',
    description_template: '{summary}\n\nПолный подкаст: {podcast_link}',
    hashtags: rules.hashtags_fixed,
  }

  const socialTg = rules.social_templates?.telegram ?? 'Эмодзи + ключевые мысли + ссылка на видео'
  const socialYt = rules.social_templates?.youtube_community ?? 'Текст + опрос для вовлечения'
  const socialIg = rules.social_templates?.instagram_stories ?? 'Описание гостя + 3 причины посмотреть + CTA'

  return `Ты — опытный YouTube продюсер и SEO-стратег. Ты готовишь полный пакет для публикации подкаста.

## Правила канала

### Формат заголовка подкаста
${rules.title_format}

### Шаблон описания
${rules.description_template}

### Обязательные ссылки
${rules.required_links.map(l => `- ${l}`).join('\n')}

### Фиксированные хештеги
${rules.hashtags_fixed.join(' ')}

${rules.brand_voice ? `### Голос бренда\n${rules.brand_voice}` : ''}

### Формат заголовков клипов
${clipRules.title_format}

## Что нужно сгенерировать

Верни ТОЛЬКО валидный JSON (без markdown, без \`\`\`):

{
  "title_variants": [
    {
      "text": "Заголовок (макс 100 символов)",
      "reasoning": "Почему этот заголовок хорош",
      "style": "hook|question|statement|curiosity_gap|listicle",
      "is_recommended": true/false (только один true — лучший вариант)
    }
  ],
  "description": "Полное описание по шаблону канала. С тайм-кодами, ссылками, хештегами.",
  "tags": ["тег1", "тег2", "...15-20 наиболее релевантных теме тегов"],
  "timecodes": [
    {"time": "00:00", "label": "SEO-заголовок этого сегмента (не случайный текст)"}
  ],
  "thumbnail_spec": {
    "prompt": "Промпт для генерации фона обложки (без текста, описание визуала)",
    "text_overlay_variants": ["Вариант 1 текста на обложку", "Вариант 2", "Вариант 3"],
    "style_notes": "Стиль: цветной фон, фото гостя справа, заголовок крупно слева"
  },
  "ai_score": 85,
  "clip_suggestions": [
    {
      "start": 300,
      "end": 1200,
      "title_variants": [{"text": "...", "reasoning": "...", "style": "hook", "is_recommended": true}],
      "description": "Короткое описание клипа с ключевой мыслью",
      "tags": ["тег1", "тег2"],
      "thumbnail_prompt": "Промпт для обложки этого клипа",
      "why_it_works": "Объяснение почему этот сегмент зацепит аудиторию",
      "type": "clip"
    }
  ],
  "short_suggestions": [
    {
      "start": 600,
      "end": 650,
      "title_variants": [{"text": "...", "reasoning": "...", "style": "hook", "is_recommended": true}],
      "description": "Описание для shorts",
      "tags": ["тег1"],
      "thumbnail_prompt": "",
      "why_it_works": "Почему этот момент подходит для short",
      "type": "short",
      "hook_text": "Текст-крючок для первых секунд (вертикальный формат)"
    }
  ],
  "social_drafts": [
    {
      "platform": "telegram",
      "content": "Пост для Telegram канала"
    },
    {
      "platform": "youtube_community",
      "content": "Пост для вкладки Сообщество"
    },
    {
      "platform": "instagram_stories",
      "content": "Текст для Instagram Stories"
    }
  ],
  "guest_info": {
    "name": "Имя гостя",
    "description": "Кто этот человек, чем известен",
    "topics": ["тема1", "тема2", "тема3"]
  },
  "content_summary": "2-3 предложения: о чём этот подкаст, главная мысль"
}

## Правила генерации

### Заголовки (3-5 вариантов)
- Разные стили: hook (интрига), question (вопрос), statement (утверждение), curiosity_gap (незавершённость), listicle (список)
- Макс 100 символов. Формат канала: "${rules.title_format}"
- **Обязательно** отметь is_recommended=true у лучшего. В reasoning объясни ПОЧЕМУ именно этот лучший.

### Описание
- Заполни шаблон канала реальным содержимым из транскрипта
- Добавь тайм-коды в формате: 00:00 — Заголовок сегмента
- В конце: обязательные ссылки + хештеги

### Теги (15-20)
- Наиболее релевантные теме видео
- Включи имя гостя, ключевые темы, общие теги канала
- Без # — чистые слова/фразы

### Тайм-коды (${timecodesCount} штук)
- Формат "MM:SS" (или "HH:MM:SS" для видео >60 мин)
- Label = SEO-заголовок сегмента (как подзаголовки статьи, не случайный текст)
- Пропорционально длительности видео (${durationMin} мин)
- Первый всегда "00:00" с вводным заголовком

### Обложка
- prompt: опиши визуальную сцену для фона (БЕЗ текста, текст накладывается отдельно)
- 3 варианта текста на обложку: короткий (2-4 слова), средний (4-6 слов), длинный (цитата/вопрос)

### Клипы (3-5 сегментов по 3-20 мин)
- Самостоятельные, интересные вне контекста подкаста
- Заголовки в hook-стиле (отличаются от стиля подкаста)
- why_it_works: конкретно объясни почему этот сегмент зацепит

### Shorts (3-5 моментов до 60 сек)
- Сильный hook в первые 3 секунды
- hook_text: текст для первого кадра вертикального видео
- Эмоциональные, провокационные или полезные моменты

### Анонсы в соцсетях
**Telegram:** ${socialTg}
**YouTube Community:** ${socialYt}
**Instagram Stories:** ${socialIg}

### Информация о госте
- Извлеки из транскрипта: имя, кто он, чем занимается
- Ключевые темы которые обсуждались

### AI Score (0-100)
- Структурированность контента
- Глубина и экспертность
- Engagement potential (кликабельность, shareability)
- Качество гостя и диалога`
}

export function buildProducerUserPrompt(params: {
  currentTitle: string
  currentDescription: string
  transcript: string
  durationSeconds: number
  guestInfo?: GuestInfo | null
}): string {
  const durationMin = Math.round(params.durationSeconds / 60)

  const maxLen = 120000
  const transcript = params.transcript.length > maxLen
    ? params.transcript.slice(0, 80000) + '\n\n[...середина обрезана...]\n\n' + params.transcript.slice(-30000)
    : params.transcript

  const guestSection = params.guestInfo
    ? `\n**Информация о госте (известная):**\n- Имя: ${params.guestInfo.name}\n- Описание: ${params.guestInfo.description}\n- Темы: ${params.guestInfo.topics.join(', ')}`
    : ''

  return `## Видео для подготовки к публикации

**Текущий заголовок:** ${params.currentTitle}
**Длительность:** ${durationMin} минут
**Текущее описание:** ${params.currentDescription || '(пусто)'}
${guestSection}

## Транскрипт

${transcript}

---

Подготовь полный пакет для публикации этого подкаста. Верни JSON.`
}
