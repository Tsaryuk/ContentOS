// Warn the user before they navigate away with unsaved changes.
//
// Limitations:
//   - The browser-rendered confirmation dialog text is fixed by the
//     browser; we can't customize the message. Modern Chrome/Safari show
//     a generic "Changes you made may not be saved" prompt.
//   - This only catches HARD navigation (closing tab, reload, typing a
//     new URL). For client-side Next.js navigation we'd need to hook
//     router events, which is fragile in App Router. Acceptable since
//     all our editors are full pages and users typically reload/close
//     rather than navigating in-app away from a draft.

'use client'

import { useEffect } from 'react'

export function useUnsavedChanges(dirty: boolean): void {
  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(e: BeforeUnloadEvent): void {
      e.preventDefault()
      // Required for legacy Chrome to actually show the prompt. Modern
      // browsers ignore the returned value.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])
}
