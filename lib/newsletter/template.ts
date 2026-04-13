export interface NewsletterData {
  tag: string
  subject: string
  subtitle: string
  bodyHtml: string
}

const TEMPLATE_HEAD = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Стратегия Жизни</title>
<style>
body { margin: 0; padding: 0; background: #ffffff; color: #333333; font-family: Georgia, 'Times New Roman', serif; font-size: 18px; line-height: 1.6em; }
.wrap { max-width: 500px; margin: 20px auto; padding: 0 20px; }
p { margin: 0 0 1em; }
h1 { font-size: 28px; font-weight: normal; color: #111; margin: 0 0 6px; line-height: 1.2; }
h2 { font-size: 20px; font-weight: bold; color: #111; margin: 32px 0 8px; font-family: Helvetica, Arial, sans-serif; text-transform: uppercase; letter-spacing: 0.05em; }
.tag { font-family: Helvetica, Arial, sans-serif; font-size: 12px; color: #999; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
.sub { font-style: italic; color: #666; font-size: 17px; margin-bottom: 24px; }
.divider { border: none; border-top: 1px solid #e0e0e0; margin: 24px 0; }
blockquote { border-left: 4px solid #1a4fff; padding: 4px 0 4px 16px; margin: 20px 0; color: #333; font-style: italic; }
blockquote cite { display: block; margin-top: 6px; font-style: normal; font-size: 13px; color: #999; font-family: Helvetica, Arial, sans-serif; }
.insight { border-left: 4px solid #1a4fff; padding: 4px 0 4px 16px; margin: 24px 0; }
.ins-label { font-family: Helvetica, Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #1a4fff; margin-bottom: 6px; }
.ins-text { font-style: italic; color: #111; }
.qblock { border-top: 1px solid #e0e0e0; border-bottom: 1px solid #e0e0e0; padding: 20px 0; margin: 28px 0; }
.q-label { font-family: Helvetica, Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #999; margin-bottom: 8px; }
.q-text { font-style: italic; font-size: 19px; color: #111; line-height: 1.4; }
a { color: #1a4fff; text-decoration: none; border-bottom: 1px dotted #1a4fff; }
.teaser-label { font-family: Helvetica, Arial, sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #999; }
.footer { border-top: 1px dotted #ccc; padding: 16px 0 10px; font-family: Helvetica, Arial, sans-serif; color: #aaa; font-size: 12px; line-height: 2; }
.footer a { color: #1a4fff; border-bottom: 1px dotted #1a4fff; font-size: 12px; }
.muted { color: #888; font-size: 15px; }
strong { color: #111; }
@media only screen and (max-width: 500px) {
  .wrap { margin: 10px 0; }
  h1 { font-size: 24px; }
}
</style>
</head>
<body>
<div class="wrap">`

const TEMPLATE_FOOTER = `
  <div class="footer">
    <a href="https://tsaryuk.ru">tsaryuk.ru</a> &nbsp;&middot;&nbsp;
    <a href="https://t.me/tsaryuk_ru">@tsaryuk_ru</a> &nbsp;&middot;&nbsp;
    <a href="https://tsaryuk.ru/strategy1">Семинар по стратегии</a><br>
    <a href="{{unsubscribe}}">Отписаться</a>
  </div>
</div>
</body>
</html>`

export function renderNewsletter(data: NewsletterData): string {
  const header = `
  <div class="tag">${escapeHtml(data.tag)}</div>
  <h1>${escapeHtml(data.subject)}</h1>
  <p class="sub">${escapeHtml(data.subtitle)}</p>
  <hr class="divider">`

  return TEMPLATE_HEAD + header + '\n' + data.bodyHtml + '\n' + TEMPLATE_FOOTER
}

export function renderPreview(data: NewsletterData): string {
  return renderNewsletter(data).replace('{{unsubscribe}}', '#')
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export { TEMPLATE_HEAD, TEMPLATE_FOOTER }
