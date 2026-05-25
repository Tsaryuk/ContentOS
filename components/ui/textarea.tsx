// Multi-line counterpart to <Input>. Same surface, same focus ring, same
// invalid state — just a different element. Defaults `resize-none` because
// almost every textarea in this app sits inside a form column where the
// user resizing it would break the surrounding layout. Override per-case
// with `className="resize-y"`.

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean
}

const baseClass =
  'block w-full px-3 py-2 rounded-lg ' +
  'bg-background border border-border ' +
  'text-sm text-foreground placeholder:text-muted-foreground/60 ' +
  'resize-none ' +
  'transition-[border-color,box-shadow,background-color] duration-150 ' +
  'focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

const invalidClass =
  'border-destructive/60 focus:border-destructive focus:ring-destructive/30'

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(baseClass, invalid && invalidClass, className)}
      {...props}
    />
  ),
)
Textarea.displayName = 'Textarea'
