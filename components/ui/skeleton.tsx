// Skeleton placeholder for loading states. Use instead of "…" / em-dash
// text — keeps layout stable while the real data arrives.
//
// Usage:
//   {loading ? <Skeleton className="h-8 w-32" /> : <span>{value}</span>}
//   <SkeletonText lines={3} />

import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-muted/30',
        className,
      )}
      aria-busy="true"
      aria-label="Загружаем"
      {...props}
    />
  )
}

interface SkeletonTextProps {
  lines?: number
  className?: string
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  // Vary widths so the placeholder doesn't read as a perfectly uniform
  // block — looks closer to real text loading.
  const widths = ['w-full', 'w-[92%]', 'w-[76%]']
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3', widths[i % widths.length])} />
      ))}
    </div>
  )
}
