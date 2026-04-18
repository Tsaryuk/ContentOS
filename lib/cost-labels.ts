/**
 * Russian labels for AI task and provider names shown in /admin/costs.
 * Separate from lib/cost.ts so the tracker can stay English internally
 * (lowercase keys are easier to grep in logs/metadata).
 */

import type { Provider, Task } from '@/lib/cost'

export const TASK_LABEL_RU: Record<Task | 'unknown', string> = {
  transcribe:         'Расшифровка',
  produce:            'Мастер-продюсер',
  generate:           'Генерация метаданных',
  thumbnail:          'Обложки YouTube',
  cover:              'Обложка статьи',
  proofread:          'Корректура транскрипта',
  clip_scoring:       'Оценка клипов',
  short_title:        'Заголовки Shorts',
  style_edit:         'AI-стилист',
  comments_draft:     'Ответы на комментарии',
  carousel_generate:  'Карусели',
  newsletter_draft:   'Рассылка',
  article_structure:  'Структура статьи',
  telegram_generate:  'Telegram: генерация',
  telegram_suggest:   'Telegram: подсказки',
  content_ideas:      'Идеи контента',
  other:              'Прочее',
  unknown:            'Без задачи',
}

export const PROVIDER_LABEL_RU: Record<Provider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai:    'OpenAI',
  fal:       'fal.ai',
  recraft:   'Recraft',
  unisender: 'Unisender',
}

export function labelTask(task: string | null | undefined): string {
  if (!task) return TASK_LABEL_RU.unknown
  return (TASK_LABEL_RU as Record<string, string>)[task] ?? task
}

export function labelProvider(provider: string | null | undefined): string {
  if (!provider) return '—'
  return (PROVIDER_LABEL_RU as Record<string, string>)[provider] ?? provider
}
