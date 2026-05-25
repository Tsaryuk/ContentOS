// Generates titles / tags / angles for a freshly captured idea, plus
// flags similarity to past articles. The model gets the recent article
// titles+subtitles so it can warn "you wrote about this in X" — that's
// our poor-man's RAG for the inbox flow, no pgvector required.
//
// Output is JSON-parsed; defensive parsing falls back to empty arrays
// if the model returns prose instead of JSON.

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'
import { supabaseAdmin } from '@/lib/supabase'
import { ARTICLE_CATEGORIES } from '@/lib/articles/categories'

const anthropic = new Anthropic()

export interface SimilarArticle {
  id: string
  title: string
  blog_slug: string | null
  overlap_reason: string
}

export interface IdeaSuggestions {
  titles: string[]
  tags: string[]
  angles: string[]
  similar: SimilarArticle[]
}

const SYSTEM = `Ты — редактор-наставник Дениса Царюка. Помогаешь развернуть сырую мысль в готовую к написанию идею статьи. Стиль: Dan Koe / Mark Manson — провокационный, личный, без инфобизнес-шаблонов.

Когда автор кидает мысль, твоя работа — за один проход:

1. **3 варианта заголовка** — разные углы атаки. Один прямой, один парадоксальный/вопрос, один с конкретикой (цифра, время, имя). Никаких «5 шагов к успеху», «секреты», «как стать», «гайд».

2. **2-4 тега** из списка: ${ARTICLE_CATEGORIES.join(', ')}. Только из этого списка.

3. **3 угла-провокации** — это короткие тезисы (1 фраза каждый), которые автор может использовать как ключевую мысль. Они должны спорить с очевидным или поворачивать тему. Не общие места.

4. **Похожие статьи** — если в списке прошлых статей есть тематически близкие, верни до 2 ссылок (article_id + одно предложение «о чём перекликается»). Если ничего не близко — пустой массив.

ВЫХОД: только валидный JSON, БЕЗ markdown-обёрток:
{
  "titles": ["...", "...", "..."],
  "tags": ["...", "..."],
  "angles": ["...", "...", "..."],
  "similar": [{ "id": "uuid", "title": "...", "overlap_reason": "..." }]
}`

interface PastArticle {
  id: string
  title: string
  subtitle: string | null
  blog_slug: string | null
}

function parsePayload(raw: string, articleIndex: Map<string, PastArticle>): IdeaSuggestions {
  const empty: IdeaSuggestions = { titles: [], tags: [], angles: [], similar: [] }
  let text = raw.trim()
  // Strip ```json ... ``` fences if model insists.
  text = text.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(text) as Record<string, unknown> } catch { return empty }
  const titles = Array.isArray(parsed.titles)
    ? (parsed.titles as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 3)
    : []
  const tags = Array.isArray(parsed.tags)
    ? (parsed.tags as unknown[])
        .filter((t): t is string => typeof t === 'string')
        .filter((t) => (ARTICLE_CATEGORIES as readonly string[]).includes(t))
        .slice(0, 4)
    : []
  const angles = Array.isArray(parsed.angles)
    ? (parsed.angles as unknown[]).filter((t): t is string => typeof t === 'string').slice(0, 3)
    : []
  const similar = Array.isArray(parsed.similar)
    ? (parsed.similar as Array<Record<string, unknown>>)
        .map((s): SimilarArticle | null => {
          const id = typeof s.id === 'string' ? s.id : null
          const reason = typeof s.overlap_reason === 'string' ? s.overlap_reason : ''
          if (!id) return null
          const real = articleIndex.get(id)
          // Only return ids we actually have — model sometimes invents UUIDs.
          if (!real) return null
          return { id, title: real.title, blog_slug: real.blog_slug, overlap_reason: reason }
        })
        .filter((s): s is SimilarArticle => s !== null)
        .slice(0, 2)
    : []
  return { titles, tags, angles, similar }
}

export async function suggestForIdea(
  rawThought: string,
  projectId: string | null,
): Promise<IdeaSuggestions> {
  // Pull up to 40 most recent articles for this project so the model
  // can spot overlap. Title + subtitle is enough — no need to ship
  // full body_html.
  let articlesQuery = supabaseAdmin
    .from('nl_articles')
    .select('id, title, subtitle, blog_slug, status')
    .neq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(40)
  if (projectId) articlesQuery = articlesQuery.eq('project_id', projectId)
  const { data: past } = await articlesQuery
  const articles = (past ?? []) as PastArticle[]
  const articleIndex = new Map(articles.map((a) => [a.id, a]))

  const articlesBlock = articles.length === 0
    ? '(прошлых статей нет — ничего сравнить)'
    : articles
        .map((a) => `[${a.id}] «${a.title}»${a.subtitle ? ` — ${a.subtitle}` : ''}`)
        .join('\n')

  const user = `СЫРАЯ МЫСЛЬ АВТОРА:
${rawThought.trim()}

ПОСЛЕДНИЕ СТАТЬИ АВТОРА (для проверки overlap):
${articlesBlock}

Сгенерируй 3 заголовка, 2-4 тега, 3 угла-провокации и (если есть) до 2 похожих статей. JSON.`

  const response = await anthropic.messages.create({
    model: AI_MODELS.claude,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{ role: 'user', content: user }],
  })

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  return parsePayload(raw, articleIndex)
}
