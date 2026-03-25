import type { ChannelRules } from './types'

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
