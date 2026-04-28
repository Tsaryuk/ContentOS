// Prompt builders for AI replies to YouTube comments.
// Per-channel tone via channel.rules.comments.tone; transcript heuristic
// (full text if short, chunks with timecodes if long).

const TRANSCRIPT_FULL_THRESHOLD = 8000

export interface CommentReplyConfig {
  enabled: boolean
  auto_reply: boolean
  daily_limit: number
  tone: string
  telegram_url?: string
  community_url?: string
  cta_frequency: number
  skip_rules: string[]
  max_reply_length: number
  thread_depth: number
}

export const DEFAULT_COMMENT_REPLY_CONFIG: CommentReplyConfig = {
  enabled: false,
  auto_reply: false,
  daily_limit: 3,
  tone: '',
  cta_frequency: 0.3,
  skip_rules: ['spam', 'owner_reply', 'too_short', 'negative_toxic'],
  max_reply_length: 350,
  thread_depth: 1,
}

export interface TranscriptChunk {
  start_secs?: number
  end_secs?: number
  text: string
}

export interface SystemPromptInput {
  channelTitle: string
  channelHandle?: string | null
  tone: string
  telegramUrl?: string
  communityUrl?: string
  maxLength: number
  shouldIncludeCta: boolean
}

export interface UserPromptInput {
  videoTitle: string
  videoDescription?: string | null
  transcript?: string | null
  transcriptChunks?: TranscriptChunk[] | null
  commentText: string
  commentAuthor: string
  parentReplyText?: string | null
  shouldIncludeCta: boolean
}

export function decideCta(ctaFrequency: number, rng: () => number = Math.random): boolean {
  if (!Number.isFinite(ctaFrequency)) return false
  if (ctaFrequency <= 0) return false
  if (ctaFrequency >= 1) return true
  return rng() < ctaFrequency
}

function formatSecs(secs: number): string {
  const s = Math.max(0, Math.floor(secs))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export function buildTranscriptContext(
  transcript: string | null | undefined,
  chunks: TranscriptChunk[] | null | undefined,
): string {
  const full = (transcript ?? '').trim()
  if (full && full.length <= TRANSCRIPT_FULL_THRESHOLD) {
    return `Полный транскрипт видео:\n\n${full}`
  }

  if (chunks && chunks.length > 0) {
    const lines = chunks
      .filter((c) => c.text && c.text.trim().length > 0)
      .map((c) => {
        const tc = typeof c.start_secs === 'number' ? `[${formatSecs(c.start_secs)}] ` : ''
        return `${tc}${c.text.trim()}`
      })
    if (lines.length > 0) {
      return `Транскрипт с тайм-кодами (используй формат [MM:SS], если ссылаешься на конкретный момент видео):\n\n${lines.join('\n')}`
    }
  }

  if (full) {
    return `Транскрипт видео (фрагмент):\n\n${full.slice(0, TRANSCRIPT_FULL_THRESHOLD)}`
  }
  return 'Транскрипт видео недоступен.'
}

export function buildCommentReplySystemPrompt(input: SystemPromptInput): string {
  const tone = input.tone.trim() || 'Спокойный, прямой, без лекторства. Пишу как равный, не как эксперт сверху.'

  const ctaBlock = input.shouldIncludeCta
    ? buildCtaBlock(input.telegramUrl, input.communityUrl)
    : 'CTA не вставляй. Просто отвечай по существу.'

  return `Ты — автор YouTube-канала «${input.channelTitle}»${input.channelHandle ? ` (${input.channelHandle})` : ''}.
Отвечаешь на комментарий зрителя ПОД ТВОИМ ВИДЕО — не как саппорт, а как сам автор.

ТОН ГОЛОСА:
${tone}

ПРАВИЛА ОТВЕТА:
- 1–3 предложения, максимум ${input.maxLength} символов.
- На русском, если комментарий на русском; в остальных случаях — на языке комментария.
- Обращайся к человеку напрямую (по имени/нику или просто «ты»).
- Если в комментарии вопрос — отвечай на вопрос. Если он касается конкретного момента видео и есть тайм-коды в транскрипте — можно сослаться в формате [MM:SS].
- На несогласие реагируй спокойно, без оборонительной позиции. Признавай точку зрения, потом давай свою — коротко.
- На благодарность — тепло и коротко, без шаблонов «спасибо за комментарий».
- На раздражение/токсичность — короткий вежливый ответ, без оправданий.

ЧЕГО ИЗБЕГАТЬ:
- Маркетинговых штампов, восклицательных знаков-каскадов, эмодзи-спама (1 эмодзи максимум, и только если уместно).
- Фраз вроде «Спасибо за комментарий!», «Рад, что вам понравилось!», «Подписывайтесь на канал».
- Повторения мысли комментатора своими словами в начале ответа.

${ctaBlock}

ВЫХОД: только текст ответа, без кавычек и преамбулы.`
}

function buildCtaBlock(telegramUrl?: string, communityUrl?: string): string {
  const parts: string[] = []
  if (telegramUrl) parts.push(`Телеграм-канал: ${telegramUrl}`)
  if (communityUrl) parts.push(`Сообщество: ${communityUrl}`)

  if (parts.length === 0) {
    return 'CTA не вставляй (ссылок нет).'
  }

  return `CTA (опционально, только если естественно вписывается):
- Можно мягко позвать в ${parts.join(' или ')}.
- НЕ вставляй CTA, если человек злится, спорит или комментарий короткий ритуальный («спасибо», «класс»).
- Один CTA на ответ, в конце, естественной фразой.`
}

export function buildCommentReplyUserPrompt(input: UserPromptInput): string {
  const transcriptContext = buildTranscriptContext(input.transcript, input.transcriptChunks)
  const description = input.videoDescription?.trim()
    ? `\n\nОписание видео:\n${input.videoDescription.trim().slice(0, 1000)}`
    : ''

  const parentBlock = input.parentReplyText
    ? `\n\nКОНТЕКСТ ТРЕДА — это уже ответ зрителя на твой предыдущий ответ. Твой предыдущий ответ был:\n«${input.parentReplyText}»\nТеперь зритель ответил тебе. Не повторяй то, что уже сказал — продолжи диалог.`
    : ''

  return `Видео: «${input.videoTitle}»${description}

${transcriptContext}

КОММЕНТАРИЙ ОТ @${input.commentAuthor}:
«${input.commentText}»${parentBlock}

Напиши ответ.`
}

export interface ClassifierInput {
  commentText: string
  commentAuthor: string
  videoTitle: string
}

export const CLASSIFIER_SYSTEM_PROMPT = `Ты — классификатор YouTube-комментариев. На вход — текст комментария.
Верни СТРОГО валидный JSON без преамбулы и без markdown:
{
  "category": "question" | "opinion" | "gratitude" | "disagreement" | "spam" | "toxic" | "off_topic",
  "sentiment": "positive" | "neutral" | "negative",
  "toxicity": <число 0..1>,
  "has_question": true | false,
  "language": "<ISO-код языка, например ru, en>",
  "skip_reason": null | "spam" | "too_short" | "negative_toxic"
}

Правила skip_reason:
- "spam" — реклама, ссылки на сторонние сервисы, копипаста, попытка продать.
- "too_short" — меньше 3 слов И без вопроса.
- "negative_toxic" — оскорбления, мат в адрес автора, явная токсичность (toxicity >= 0.7).
- null — во всех остальных случаях.`

export function buildClassifierUserPrompt(input: ClassifierInput): string {
  return `Видео: «${input.videoTitle}»
Автор комментария: ${input.commentAuthor}
Текст:
«${input.commentText}»`
}
