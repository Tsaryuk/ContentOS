// Shared <Input> component — replaces the 50+ hand-rolled
// `w-full h-9 px-3 rounded-lg bg-background border border-border …`
// strings sprinkled across pages. Focus state, disabled state, and
// invalid state all live here so they stay consistent.
//
// Forward ref so existing useRef<HTMLInputElement> patterns keep working.

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Adds `aria-invalid` + a destructive ring without breaking other props. */
  invalid?: boolean
}

const baseClass =
  // Layout
  'block w-full h-9 px-3 rounded-lg ' +
  // Surface
  'bg-background border border-border ' +
  // Type
  'text-sm text-foreground placeholder:text-muted-foreground/60 ' +
  // Numbers stay aligned across rows.
  'tabular-nums ' +
  // Interaction
  'transition-[border-color,box-shadow,background-color] duration-150 ' +
  'focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 ' +
  // Disabled
  'disabled:opacity-50 disabled:cursor-not-allowed'

const invalidClass =
  'border-destructive/60 focus:border-destructive focus:ring-destructive/30'

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(baseClass, invalid && invalidClass, className)}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
