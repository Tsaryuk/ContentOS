// Единый конфиг AI-моделей для всего проекта.
// Меняем модель в одном месте — обновляется везде.
// Если модель устареет, исправить нужно только этот файл.

export const AI_MODELS = {
  /** Основная модель для генерации контента (producer, карусели, комментарии) */
  claude: process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-20250514',

  /** Модель для лёгких задач (если понадобится haiku) */
  claudeLight: process.env.CLAUDE_MODEL_LIGHT ?? 'claude-sonnet-4-20250514',
} as const
