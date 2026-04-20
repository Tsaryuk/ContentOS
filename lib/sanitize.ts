/**
 * HTML sanitization for user-generated content rendered via
 * dangerouslySetInnerHTML. Strips <script>, inline event handlers
 * (onclick=...), javascript: URIs, and anything outside the allow-list.
 *
 * Two presets:
 *   - sanitizeArticleHtml: rich article body (headings, lists, images, links)
 *   - sanitizeNewsletterHtml: same shape, allows inline styles for email layout
 *   - sanitizeTelegramPostHtml: minimal (bold/italic/links) — matches Telegram MarkdownV2 surface
 */

import sanitizeHtml, { IOptions } from 'sanitize-html'

const ARTICLE_OPTIONS: IOptions = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'br', 'hr',
    'strong', 'em', 'u', 's', 'code', 'pre',
    'blockquote', 'ul', 'ol', 'li',
    'a', 'img', 'figure', 'figcaption',
    'iframe', 'div', 'span', 'mark',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height', 'loading'],
    iframe: ['src', 'title', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder'],
    div: ['class'],
    span: ['class'],
    figure: ['class'],
    p: ['class'],
  },
  allowedSchemes: ['https', 'mailto'],
  allowedSchemesByTag: { img: ['https', 'data'] },
  allowedIframeHostnames: [
    'www.youtube.com',
    'youtube.com',
    'youtu.be',
    'player.vimeo.com',
  ],
  // Force rel on external links to prevent tabnabbing
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
  },
  disallowedTagsMode: 'discard',
}

const NEWSLETTER_OPTIONS: IOptions = {
  ...ARTICLE_OPTIONS,
  // Newsletters use <section data-kind="..."> blocks (see lib/newsletter/sections.ts)
  // so the chat wizard can find/replace individual parts of the email body.
  // Keep this list in sync with SECTION_KINDS when adding new section types.
  // sanitize-html types `allowedTags` as `string[] | false` — Array.isArray
  // narrows it safely, a `?? []` wouldn't (it lets `false` through and then
  // spread blows up at build time).
  allowedTags: [
    ...(Array.isArray(ARTICLE_OPTIONS.allowedTags) ? ARTICLE_OPTIONS.allowedTags : []),
    'section',
  ],
  allowedAttributes: {
    ...ARTICLE_OPTIONS.allowedAttributes,
    '*': ['style', 'class', 'data-kind', 'data-placeholder'],
  },
  // Email renders inline styles; allow them but still block javascript:/expression
  allowedStyles: {
    '*': {
      'color': [/.*/],
      'background-color': [/.*/],
      'font-size': [/.*/],
      'font-weight': [/.*/],
      'font-style': [/.*/],
      'text-align': [/^(left|right|center|justify)$/],
      'text-decoration': [/.*/],
      'margin': [/.*/],
      'margin-top': [/.*/],
      'margin-bottom': [/.*/],
      'margin-left': [/.*/],
      'margin-right': [/.*/],
      'padding': [/.*/],
      'padding-top': [/.*/],
      'padding-bottom': [/.*/],
      'padding-left': [/.*/],
      'padding-right': [/.*/],
      'border': [/.*/],
      'border-radius': [/.*/],
      'width': [/.*/],
      'height': [/.*/],
      'max-width': [/.*/],
      'line-height': [/.*/],
    },
  },
}

const TELEGRAM_OPTIONS: IOptions = {
  allowedTags: ['b', 'strong', 'i', 'em', 'u', 's', 'code', 'pre', 'a', 'br'],
  allowedAttributes: {
    a: ['href'],
  },
  allowedSchemes: ['https', 'mailto', 'tg'],
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
  },
  disallowedTagsMode: 'discard',
}

export function sanitizeArticleHtml(html: string | null | undefined): string {
  if (!html) return ''
  return sanitizeHtml(html, ARTICLE_OPTIONS)
}

export function sanitizeNewsletterHtml(html: string | null | undefined): string {
  if (!html) return ''
  return sanitizeHtml(html, NEWSLETTER_OPTIONS)
}

export function sanitizeTelegramPostHtml(html: string | null | undefined): string {
  if (!html) return ''
  return sanitizeHtml(html, TELEGRAM_OPTIONS)
}
