// Generic empty-state card. Same pattern repeated four ways across the
// app (FileText icon + heading + sub + optional CTA) — collapsed to one
// component so the next "пусто" screen costs ~5 lines.
//
// Visual: centered column, icon ghosted at the top, primary text in
// foreground colour, secondary muted. CTA goes underneath as a child.

import type { ReactNode } from 'react'
import { Card } from '@/components/ui/card'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <Card className={`p-12 flex flex-col items-center justify-center text-center ${className ?? ''}`}>
      {icon && (
        <div className="mb-3 text-muted-foreground/60 [&>svg]:w-8 [&>svg]:h-8">
          {icon}
        </div>
      )}
      <p className="text-foreground font-medium mb-1">{title}</p>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </Card>
  )
}
