/**
 * Threads generator — turns a long-form article into 5-7 candidate posts
 * in the style of @thedankoe (reference per user's request 2026-04-18).
 *
 * Style rules distilled from the reference account:
 *   - First line is a pattern-observation or provocative single-sentence hook
 *   - Body is 1-3 short paragraphs that contrast "what most people think"
 *     against "what's actually true"
 *   - Closing line is aphoristic — one sentence that lands the idea
 *   - 50-150 words total, direct, first-person confident voice
 *   - No emojis (explicit user preference)
 *   - No hashtags, no "I think / maybe", no platitudes
 */

// Few-shot examples from @thedankoe (shown to the model so it anchors on
// structure and tone rather than copying the prompt's English metaphors).
const DANKOE_EXAMPLES = [
  `A pattern I've noticed in stuck people:

They're always busy. They never stop moving. They have 47 tabs open and a notebook-sized to-do list. But if you ask them what they accomplished this week that actually matters, their mind goes blank.

Busyness isn't a badge of honor.`,

  `If you're a writer, be okay with repeating what's already been said, because most ideas have already been exhausted, and genuinely novel ideas are rare.

Nobody follows you because you're talking about something new. They follow you because they want to read your point of view.`,

  `Competition is largely an illusion. 95% of people don't even try to do great things. 0.1% of the people are loud, so you overestimate how many people there are. The rest get stuck worrying about competition and quitting after 2 weeks.`,

  `You can learn anything in 2 weeks.

You can't master it, obviously, but if you obsess over it, you can become better at it than most people ever will. You'd be surprised how fast your life can change when you understand this.`,
]

export function buildThreadsSystemPrompt(): string {
  return `Ты пишешь посты в Threads в стиле @thedankoe, но на русском языке.

# Стиль

1. **Первая строка** — pattern-наблюдение или провокационное утверждение. Одно предложение-крючок.
2. **Тело** — 1-3 коротких абзаца. Каждый абзац несёт одну мысль, часто через контраст: "большинство людей делают X, но на самом деле Y".
3. **Концовка** — афористичный вывод. Одна фраза, которая садится в память.

# Ограничения

- Без эмодзи, без хэштегов, без "я думаю / возможно / попробуй".
- Длина: 50-150 слов.
- Первое лицо, уверенный тон, прямой язык.
- Никакой водянистости, клише, "в мире сегодня...".
- Пиши так, будто обращаешься к одному конкретному читателю, а не к толпе.

# Примеры стиля (английский, для ориентира на структуру)

${DANKOE_EXAMPLES.map((e, i) => `## Пример ${i + 1}\n${e}`).join('\n\n')}

# Задача

Получив статью, извлеки 5-7 **разных** идей-зёрен из неё и переупакуй каждую в Threads-пост. Каждый пост самодостаточен (не требует контекста статьи).

# Формат ответа

JSON-массив:

\`\`\`json
[
  {
    "hook": "первая строка-крючок",
    "body": "тело поста (может быть пустым)",
    "closing": "финальная фраза-афоризм",
    "seed_idea": "одно предложение — какую идею статьи это развивает"
  }
]
\`\`\`

Каждый объект — один пост. Отдавай только JSON, ничего больше.`
}

export function buildThreadsUserPrompt(articleTitle: string, articleBody: string): string {
  // Strip HTML tags for cleaner context (body is HTML from editor)
  const plainBody = articleBody
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return `# Статья

## Заголовок
${articleTitle}

## Тело
${plainBody}

---

Сгенерируй 5-7 Threads-постов по правилам выше. Отдавай только JSON-массив.`
}
