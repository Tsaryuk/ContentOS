// Weekly resurfacing: pick one well-performing old article and surface a
// resurface-as-email idea into the Idea Inbox. Logic:
//
//   1. Only published articles, at least 180 days old.
//   2. resurface_suggested_at IS NULL  (we never proposed it before).
//   3. Linked email had open_rate >= 15 (Unisender percentage scale).
//      Articles never sent as a newsletter are skipped — without
//      delivery stats we don't know if it was worth re-running.
//
// AI generates: subject (теплый «год спустя…»), preheader, one-paragraph
// intro that frames the resurface, and 2 update angles (что сейчас бы
// добавил). Saved as a single nl_article_ideas row with source_article_id
// set — the Inbox UI picks it up and offers a one-click newsletter promote.

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'
import { supabaseAdmin } from '@/lib/supabase'
import { logger } from '@/lib/logger'

const anthropic = new Anthropic()
const log = logger.child({ module: 'articles/resurface' })

const MIN_AGE_DAYS = 180
const MIN_OPEN_RATE = 15 // percentage, matches Unisender open_rate stored on nl_campaigns

const SYSTEM = `Ты — редактор Дениса Царюка. Тебе показывают старую статью с хорошими метриками — твоя задача предложить, как её мягко «оживить» в виде апдейт-письма «спустя год» (или сколько прошло).

Тон: рефлексивный, личный, без «10 уроков». Это письмо человеку, который читал оригинал тогда и которому интересно, что автор думает сейчас.

ВЫХОД: только валидный JSON, БЕЗ markdown-обёрток:
{
  "subject": "тема письма (не более 70 символов, без воды)",
  "preheader": "одно предложение, тот текст что показывается после темы в инбоксе",
  "intro_paragraph": "1 параграф, 2-4 предложения. Открывает письмо. Например: 'X месяцев назад я написал статью про Y. С тех пор...'",
  "update_angles": ["короткий тезис: что сейчас бы добавил", "тезис 2"]
}`

interface CandidateRow {
  id: string
  title: string
  subtitle: string | null
  blog_slug: string | null
  body_html: string
  project_id: string | null
  published_at: string | null
  issue_id: string | null
  open_rate: number | null
  campaign_subject: string | null
}

interface Payload {
  subject: string
  preheader: string
  intro_paragraph: string
  update_angles: string[]
}

function parsePayload(raw: string): Payload | null {
  let text = raw.trim().replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim()
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(text) as Record<string, unknown> } catch { return null }
  const subject = typeof parsed.subject === 'string' ? parsed.subject.trim().slice(0, 100) : ''
  const preheader = typeof parsed.preheader === 'string' ? parsed.preheader.trim().slice(0, 200) : ''
  const intro = typeof parsed.intro_paragraph === 'string' ? parsed.intro_paragraph.trim() : ''
  const angles = Array.isArray(parsed.update_angles)
    ? (parsed.update_angles as unknown[])
        .filter((s): s is string => typeof s === 'string')
        .slice(0, 3)
    : []
  if (!subject || !intro) return null
  return { subject, preheader, intro_paragraph: intro, update_angles: angles }
}

/**
 * Look for one eligible candidate. Returns null if nothing fits — the
 * cron quietly idles, no error.
 */
async function pickCandidate(): Promise<CandidateRow | null> {
  const cutoff = new Date(Date.now() - MIN_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Top open_rate first; the cron only picks ONE per run to keep the
  // Idea Inbox uncluttered.
  const { data } = await supabaseAdmin
    .from('nl_articles')
    .select(`
      id, title, subtitle, blog_slug, body_html, project_id, published_at,
      email_issue_id,
      issue:nl_issues!nl_articles_email_issue_id_fkey(
        id, subject,
        campaigns:nl_campaigns(open_rate)
      )
    `)
    .eq('status', 'published')
    .is('resurface_suggested_at', null)
    .not('email_issue_id', 'is', null)
    .lt('published_at', cutoff)
    .order('published_at', { ascending: true })
    .limit(20)

  if (!data) return null

  for (const row of data as unknown as Array<{
    id: string
    title: string
    subtitle: string | null
    blog_slug: string | null
    body_html: string
    project_id: string | null
    published_at: string | null
    email_issue_id: string | null
    issue: { id: string; subject: string; campaigns: Array<{ open_rate: number | null }> } | null
  }>) {
    const camps = row.issue?.campaigns ?? []
    const best = camps.reduce<number>((max, c) => Math.max(max, c.open_rate ?? 0), 0)
    if (best < MIN_OPEN_RATE) continue
    return {
      id: row.id,
      title: row.title,
      subtitle: row.subtitle,
      blog_slug: row.blog_slug,
      body_html: row.body_html,
      project_id: row.project_id,
      published_at: row.published_at,
      issue_id: row.issue?.id ?? null,
      open_rate: best,
      campaign_subject: row.issue?.subject ?? null,
    }
  }
  return null
}

export async function runResurfacingTick(): Promise<{ suggested: boolean }> {
  const candidate = await pickCandidate()
  if (!candidate) {
    log.info('no candidate found')
    return { suggested: false }
  }

  const ageDays = candidate.published_at
    ? Math.floor((Date.now() - new Date(candidate.published_at).getTime()) / (1000 * 60 * 60 * 24))
    : 365
  const ageLabel = ageDays >= 365
    ? `${Math.round(ageDays / 365)} год${ageDays >= 730 ? 'а' : ''}`
    : `${Math.round(ageDays / 30)} месяцев`

  const plain = (candidate.body_html ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000)

  const userPrompt = `Старая статья «${candidate.title}» (${candidate.subtitle ?? '—'}) опубликована ${ageLabel} назад. Прошлое письмо имело open_rate ${candidate.open_rate?.toFixed(1)}%.

Фрагмент текста:
${plain}

Предложи апдейт-письмо «спустя ${ageLabel}» в JSON-формате.`

  const response = await anthropic.messages.create({
    model: AI_MODELS.claude,
    max_tokens: 1200,
    system: SYSTEM,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

  const payload = parsePayload(raw)
  if (!payload) {
    log.warn({ articleId: candidate.id }, 'AI returned unparseable resurface payload')
    return { suggested: false }
  }

  // Save into the Idea Inbox. raw_thought holds a human-readable
  // explainer (open rate + age + suggested subject); ai_titles holds
  // just the proposed subject (single-title for resurface). The full
  // structured payload goes into similar_to → repurposed as a generic
  // jsonb stash since the schema already has it. Same field name is
  // misleading; we'll lean on the source_article_id flag in the UI to
  // render this row as a resurface card.
  const { data: idea, error } = await supabaseAdmin
    .from('nl_article_ideas')
    .insert({
      project_id: candidate.project_id,
      raw_thought:
        `Resurface статьи «${candidate.title}» (${ageLabel} назад, открываемость ${candidate.open_rate?.toFixed(1)}%).\n\n` +
        payload.intro_paragraph,
      ai_titles: [payload.subject],
      ai_tags: [],
      ai_angles: payload.update_angles,
      similar_to: [{ preheader: payload.preheader, source_subject: candidate.campaign_subject ?? '' }] as unknown as object[],
      source_article_id: candidate.id,
      status: 'new',
    })
    .select('id')
    .single()

  if (error || !idea) {
    log.error({ articleId: candidate.id, err: error?.message }, 'failed to insert resurface idea')
    return { suggested: false }
  }

  await supabaseAdmin
    .from('nl_articles')
    .update({ resurface_suggested_at: new Date().toISOString() })
    .eq('id', candidate.id)

  log.info({ articleId: candidate.id, ideaId: idea.id, openRate: candidate.open_rate }, 'resurface idea created')
  return { suggested: true }
}
