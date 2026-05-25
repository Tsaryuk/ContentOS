// Single source of truth for status pill colours across the app.
//
// Before this file, `/articles`, `/newsletter`, the in-editor badges,
// the dashboard cards, the ContentMultiplier panel — each defined their
// own little colour map. The same status name landed in three different
// shades depending on where you were looking ('draft' was sky-blue in
// one place, amber in another). Now there's one mapping and every
// component imports from here.
//
// `pillClass` returns full Tailwind classes ready to drop on a span:
//   <span className={pillClass('sent')}>{label}</span>
//
// `tone` returns just the colour name when you need to apply it to
// something other than a pill (e.g. an icon's text colour).

export type StatusTone = 'neutral' | 'muted' | 'info' | 'progress' | 'warn' | 'success' | 'destructive'

/**
 * Maps raw status strings (from nl_articles.status, nl_issues.status,
 * yt_videos.status, etc.) to a semantic tone. Add new statuses here as
 * they appear in code, not in scattered switch statements.
 */
const STATUS_TONE: Record<string, StatusTone> = {
  // Articles + newsletter shared lifecycle
  draft: 'muted',
  uploaded: 'info',
  scheduled: 'warn',
  sent: 'success',
  published: 'success',
  archived: 'neutral',
  // Pipelines
  pending: 'muted',
  queued: 'muted',
  transcribing: 'progress',
  generating: 'progress',
  producing: 'progress',
  publishing: 'progress',
  done: 'success',
  error: 'destructive',
  failed: 'destructive',
  // Multiplier-card buckets
  missing: 'neutral',
  ready: 'info',
}

// Tailwind classes for each tone. Pills use background + text + border
// so they read clearly on both dark and light themes.
const PILL_CLASSES: Record<StatusTone, string> = {
  neutral:     'bg-muted/15 text-muted-foreground border border-border',
  muted:       'bg-muted/15 text-muted-foreground border border-border',
  info:        'bg-blue-500/10 text-blue-500 border border-blue-500/30',
  progress:    'bg-blue-500/10 text-blue-500 border border-blue-500/30',
  warn:        'bg-amber-500/10 text-amber-500 border border-amber-500/30',
  success:     'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30',
  destructive: 'bg-destructive/10 text-destructive border border-destructive/30',
}

/** Returns a single tone bucket for a raw status string. */
export function statusTone(status: string | null | undefined): StatusTone {
  if (!status) return 'neutral'
  return STATUS_TONE[status] ?? 'neutral'
}

/** Returns ready-to-use Tailwind classes for a status pill. */
export function pillClass(status: string | null | undefined): string {
  return `inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider ${PILL_CLASSES[statusTone(status)]}`
}

const STATUS_RU: Record<string, string> = {
  draft: 'Черновик',
  uploaded: 'Загружено',
  scheduled: 'Запланировано',
  sent: 'Отправлено',
  published: 'Опубликовано',
  archived: 'В архиве',
  pending: 'Ожидание',
  queued: 'В очереди',
  transcribing: 'Транскрипция',
  generating: 'Генерация',
  producing: 'Подготовка',
  publishing: 'Публикация',
  done: 'Готово',
  error: 'Ошибка',
  failed: 'Ошибка',
  missing: 'Нет',
  ready: 'Готов',
}

/** Russian label for a raw status string. Falls back to the raw value. */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return ''
  return STATUS_RU[status] ?? status
}
