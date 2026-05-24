// Tiny wrapper around sonner — keeps the rest of the codebase from
// importing 'sonner' directly so we could swap the library later (or
// add app-wide defaults) without touching every callsite.
//
// `toastConfirm` replaces window.confirm() — returns a Promise<boolean>
// resolved when the user clicks the OK or Cancel action on the toast,
// or auto-resolves to false on timeout. Non-blocking, fits the dark
// theme, no jarring system dialog.

import { toast as sonnerToast } from 'sonner'

export const toast = sonnerToast

export interface ConfirmOptions {
  okLabel?: string
  cancelLabel?: string
  destructive?: boolean
  /** Auto-dismiss + resolve false after this many ms. 0 = never. */
  timeoutMs?: number
}

export function toastConfirm(
  message: string,
  opts: ConfirmOptions = {},
): Promise<boolean> {
  const { okLabel = 'OK', cancelLabel = 'Отмена', destructive = false, timeoutMs = 20000 } = opts
  return new Promise<boolean>((resolve) => {
    let settled = false
    const settle = (v: boolean): void => {
      if (settled) return
      settled = true
      resolve(v)
    }
    const id = sonnerToast(message, {
      // Persist until the user clicks one of the actions. Timeout below
      // applies a soft fallback so a forgotten confirmation doesn't hang
      // any awaiter forever.
      duration: timeoutMs || Infinity,
      action: {
        label: okLabel,
        onClick: () => settle(true),
      },
      cancel: {
        label: cancelLabel,
        onClick: () => settle(false),
      },
      classNames: destructive ? { actionButton: 'bg-destructive text-white' } : undefined,
    })
    // If the toast auto-dismisses (timeoutMs hit and user did nothing),
    // sonner doesn't fire either action — we treat that as cancel.
    if (timeoutMs > 0) {
      setTimeout(() => {
        if (!settled) {
          sonnerToast.dismiss(id)
          settle(false)
        }
      }, timeoutMs + 100)
    }
  })
}
