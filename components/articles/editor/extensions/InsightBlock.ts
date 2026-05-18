// Custom TipTap node mirroring the legacy HTML callout:
// <div class="insight"><div class="ins-label">Главная мысль</div><p class="ins-text">…</p></div>
// The label is fixed; only the inner "ins-text" paragraph is editable. We model
// it as a block-level node whose single content slot is a paragraph, so users
// can keep typing/styling inside the callout body.

import { Node, mergeAttributes } from '@tiptap/core'

export const InsightBlock = Node.create({
  name: 'insightBlock',
  group: 'block',
  content: 'paragraph',
  defining: true,

  parseHTML() {
    return [
      {
        tag: 'div.insight',
        // Map the legacy structure to a paragraph: ignore the label, keep ins-text.
        getContent: (node, schema) => {
          const el = node as HTMLElement
          const text = el.querySelector('.ins-text')?.textContent ?? el.textContent ?? ''
          const para = schema.nodes.paragraph.create({}, text ? schema.text(text) : null)
          return [para] as never
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'insight' }),
      ['div', { class: 'ins-label', contenteditable: 'false' }, 'Главная мысль'],
      ['p', { class: 'ins-text' }, 0],
    ]
  },

  addCommands() {
    return {
      setInsightBlock:
        () =>
        ({ commands }: { commands: { insertContent: (c: unknown) => boolean } }) =>
          commands.insertContent({
            type: this.name,
            content: [{ type: 'paragraph' }],
          }),
    } as never
  },
})
