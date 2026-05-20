// Section contract for emails generated from an article.
//
// Email body_html is a sequence of <section data-kind="…"> blocks that the
// upcoming chat wizard (C2) can locate by kind and replace without touching
// neighbouring sections. Keeping the ids here keeps the email generator, the
// wizard, and any future tooling in sync.
//
// The surrounding shell (header, footer with unsubscribe) still comes from
// lib/newsletter/template.ts — we only own the body here.

export const SECTION_KINDS = [
  'digest',
  'practice',
  'philosophy',
  'lifehack',
  'anons',
  'cta_article',
  'signoff',
] as const

export type SectionKind = typeof SECTION_KINDS[number]

export interface SectionMeta {
  kind: SectionKind
  heading: string
  placeholder: string
}

export const SECTIONS: Record<SectionKind, SectionMeta> = {
  digest: {
    kind: 'digest',
    heading: 'Главное из статьи',
    placeholder: '<p><em>Дайджест статьи появится здесь.</em></p>',
  },
  practice: {
    kind: 'practice',
    heading: 'Практическое задание',
    placeholder: '<p><em>AI добавит одно конкретное действие по мотивам статьи.</em></p>',
  },
  philosophy: {
    kind: 'philosophy',
    heading: 'Личная философия',
    placeholder: '<p class="muted"><em>Заполнится через AI-ассистента справа — нажми «Личная философия», дай ссылку на эпизод подкаста и пару слов о сути.</em></p>',
  },
  lifehack: {
    kind: 'lifehack',
    heading: 'Лайфхак недели',
    placeholder: '<p class="muted"><em>Заполнится через AI-ассистента — нажми «Лайфхак» и опиши находку.</em></p>',
  },
  anons: {
    kind: 'anons',
    heading: 'Анонс следующего выпуска',
    placeholder: '<p class="muted"><em>Заполнится через AI-ассистента — нажми «Анонс» и опиши тему следующего выпуска.</em></p>',
  },
  cta_article: {
    kind: 'cta_article',
    heading: '',
    // Real CTA gets injected at email-creation time in
    // app/api/articles/[id]/to-email/route.ts with the actual blog slug.
    // The placeholder here just covers the legacy "create an empty email"
    // path so renderEmailBody never returns a broken section.
    placeholder: '<p><em>Ссылка на полную статью добавится при сохранении.</em></p>',
  },
  signoff: {
    kind: 'signoff',
    heading: '',
    placeholder: `<p>Если что-то отозвалось — пиши в ответ, читаю всё.</p>
<p>До следующего понедельника.</p>
<p><strong>— Денис</strong></p>`,
  },
}

// CTA-block linking back to the published article. Used by /api/articles/[id]/to-email
// to fill the `cta_article` section with the actual slug at email-creation time.
// The CTA lives in its own section at the bottom of the email, *not* inside
// the digest, so the digest reads as a self-contained newsletter rather than
// "click here to read the real thing".
export function buildArticleCta(blogSlug: string | null): string {
  if (!blogSlug) return ''
  const url = `https://letters.tsaryuk.ru/articles/${blogSlug}`
  return `<div class="cta-article">
  <a class="cta-button" href="${url}">Читать полную версию →</a>
  <div class="cta-hint">Письмо — это половина мысли. На сайте — полностью.</div>
</div>`
}

// Build a single section's HTML fragment. If `content` is omitted, the
// section is emitted with its placeholder and marked data-placeholder="1" so
// the wizard can tell "not yet filled" apart from "filled by user".
export function renderSection(kind: SectionKind, content?: string): string {
  const meta = SECTIONS[kind]
  const body = content?.trim() || meta.placeholder
  const isPlaceholder = !content?.trim() ? ' data-placeholder="1"' : ''
  const headingHtml = meta.heading ? `<h2>${meta.heading}</h2>\n` : ''
  return `<section class="e-section e-${kind}" data-kind="${kind}"${isPlaceholder}>
${headingHtml}${body}
</section>`
}

// Assemble the full body_html from per-section content. Missing sections get
// their placeholder. Sections are joined with <hr class="divider"> so the
// visual rhythm matches the article editor.
export function renderEmailBody(content: Partial<Record<SectionKind, string>>): string {
  return SECTION_KINDS
    .map((kind) => renderSection(kind, content[kind]))
    .join('\n<hr class="divider">\n')
}

// Replace the content of a single <section data-kind="..."> block inside
// an existing email body while keeping the surrounding sections and <hr>
// separators intact. Used by the chat wizard (C2) to fill philosophy /
// lifehack / anons without re-rendering the whole body.
//
// The input must have been produced by renderEmailBody / renderSection so
// the section tag shape is known: the regex tolerates optional attributes
// (data-placeholder="1" / class) between data-kind and the closing >.
export function replaceSection(
  bodyHtml: string,
  kind: SectionKind,
  content: string,
): string {
  const next = renderSection(kind, content)
  const pattern = new RegExp(
    `<section\\b[^>]*\\bdata-kind=\\"${kind}\\"[^>]*>[\\s\\S]*?<\\/section>`,
    'i',
  )
  if (pattern.test(bodyHtml)) {
    return bodyHtml.replace(pattern, next)
  }
  // Section wasn't in the body yet — append before the final signoff if
  // present, otherwise at the end. The wizard calls this shortly after
  // email creation, so the section should always exist; fallback is just a
  // safety net.
  const signoffRe = /<hr class=\"divider\">\s*<section\b[^>]*\bdata-kind=\"signoff\"/i
  if (signoffRe.test(bodyHtml)) {
    return bodyHtml.replace(
      signoffRe,
      `<hr class="divider">\n${next}\n<hr class="divider">\n<section class="e-section e-signoff" data-kind="signoff"`,
    )
  }
  return `${bodyHtml}\n<hr class="divider">\n${next}`
}
