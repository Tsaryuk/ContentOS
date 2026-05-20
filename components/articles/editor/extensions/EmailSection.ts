// Custom TipTap node for newsletter section wrappers:
// <section class="e-section e-<kind>" data-kind="<kind>">…</section>
//
// Newsletter emails (lib/newsletter/sections.ts) are a sequence of these
// sections separated by <hr class="divider">. The chat wizard locates and
// replaces sections by data-kind, so the wrapper must survive a round-trip
// through the editor unchanged. Without this extension TipTap would unwrap
// <section> on parseHTML and we'd lose the structural anchors.
//
// Content is `block+` — same as a top-level document — so paragraphs,
// headings, blockquotes, insight/question blocks all nest inside normally.

import { Node, mergeAttributes } from '@tiptap/core'

export const EmailSection = Node.create({
  name: 'emailSection',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: false,

  addAttributes() {
    return {
      kind: {
        default: 'digest',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-kind') ?? 'digest',
        renderHTML: (attrs: { kind?: string }) => {
          const kind = attrs.kind ?? 'digest'
          return { 'data-kind': kind, class: `e-section e-${kind}` }
        },
      },
      placeholder: {
        // Sections rendered with their default placeholder content carry
        // data-placeholder="1" (see renderSection in lib/newsletter/sections.ts).
        // Keep the flag around so the chat wizard can still distinguish
        // "user-filled" from "untouched" after the editor round-trips.
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-placeholder'),
        renderHTML: (attrs: { placeholder?: string | null }) =>
          attrs.placeholder ? { 'data-placeholder': attrs.placeholder } : {},
      },
    }
  },

  parseHTML() {
    return [{ tag: 'section[data-kind]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['section', mergeAttributes(HTMLAttributes), 0]
  },
})
