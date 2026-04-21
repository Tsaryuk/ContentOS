'use client'

import { useCallback, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

// Small helper that lets voice dictation (or any other async source) drop
// text at the current cursor position in a textarea/input instead of just
// appending to the end. The flow is:
//   1. caller calls `insert('слово')` — it reads selectionStart/End from
//      the ref, splices the new fragment into the value, then records the
//      target caret position in a ref
//   2. after React re-renders the value, a useLayoutEffect on `value`
//      finds the pending caret position and applies it via setSelectionRange
//
// The ref-based pending position means we only move the caret when WE asked
// for it — a normal keystroke that changes `value` won't accidentally trigger
// a cursor jump because `pendingCaretRef.current` stays null.
//
// Also smooths over the "run words together" problem: if the caret sits
// right after a word character, we prepend a space, and vice versa for the
// tail — so dictating "ещё один абзац" after existing text produces
// "… предыдущее предложение. ещё один абзац." instead of "…предложение.ещё…".

type InputLike = HTMLTextAreaElement | HTMLInputElement

export interface InsertAtCaretApi {
  /** Insert `text` at the current caret position, replacing the selection
   *  if there is one. Returns the new value so the caller can optionally
   *  re-use it synchronously; in normal flow just call setValue(). */
  insert: (text: string) => void
}

export function useInsertAtCaret(
  ref: RefObject<InputLike | null>,
  value: string,
  setValue: (next: string) => void,
): InsertAtCaretApi {
  const pendingCaretRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    const pos = pendingCaretRef.current
    if (pos === null) return
    const el = ref.current
    if (el) {
      el.focus()
      try { el.setSelectionRange(pos, pos) } catch { /* input type may not support selection */ }
    }
    pendingCaretRef.current = null
  }, [value, ref])

  const insert = useCallback((fragment: string) => {
    const clean = fragment.trim()
    if (!clean) return
    const el = ref.current
    if (!el) {
      // No DOM target yet — fall back to append.
      setValue(value ? value + ' ' + clean : clean)
      return
    }
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    const before = el.value.slice(0, start)
    const after = el.value.slice(end)

    // Insert a leading space if the caret is right after a word/punctuation
    // and we'd otherwise glue words together; same for the trailing side.
    const needsLeadingSpace = before.length > 0 && !/\s$/.test(before)
    const needsTrailingSpace = after.length > 0 && !/^\s/.test(after)
    const combined = (needsLeadingSpace ? ' ' : '') + clean + (needsTrailingSpace ? ' ' : '')

    const nextValue = before + combined + after
    pendingCaretRef.current = before.length + combined.length
    setValue(nextValue)
  }, [ref, value, setValue])

  return { insert }
}
