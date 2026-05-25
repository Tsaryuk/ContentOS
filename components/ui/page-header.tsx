// Standard page header — eyebrow breadcrumb + display-serif title +
// optional description. Replaces the slightly different copy/paste of
// the same three-row layout across /articles, /ideas, /newsletter,
// /comments. Now adding a new section means one line, not a 14-line block.
//
// `actions` slot goes top-right for "Refresh" / "Create" buttons.

import type { ReactNode } from 'react'

interface PageHeaderProps {
  /** Comma-separated breadcrumb crumbs, e.g. ["ContentOS", "Идеи"]. */
  eyebrow?: string[]
  title: string
  description?: string
  /** Top-right action buttons. */
  actions?: ReactNode
}

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
      <div>
        {eyebrow && eyebrow.length > 0 && (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2 uppercase tracking-wider">
            {eyebrow.map((crumb, i) => (
              <span key={i} className={i === eyebrow.length - 1 ? 'normal-case tracking-normal' : ''}>
                {crumb}
                {i < eyebrow.length - 1 && (
                  <span className="ml-2 inline-block w-1 h-1 rounded-full bg-border align-middle" />
                )}
              </span>
            ))}
          </div>
        )}
        <h1 className="display-serif text-3xl md:text-4xl font-normal text-foreground tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  )
}
