// Custom TipTap node mirroring:
// <div class="qblock"><div class="q-label">Вопрос для размышления</div><div class="q-text">…</div></div>
// Same shape as InsightBlock — fixed label, one editable paragraph body.

import { Node, mergeAttributes } from '@tiptap/core'

export const QuestionBlock = Node.create({
  name: 'questionBlock',
  group: 'block',
  content: 'paragraph',
  defining: true,

  parseHTML() {
    return [
      {
        tag: 'div.qblock',
        getContent: (node, schema) => {
          const el = node as HTMLElement
          const text = el.querySelector('.q-text')?.textContent ?? el.textContent ?? ''
          const para = schema.nodes.paragraph.create({}, text ? schema.text(text) : null)
          return [para] as never
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'qblock' }),
      ['div', { class: 'q-label', contenteditable: 'false' }, 'Вопрос для размышления'],
      ['div', { class: 'q-text' }, 0],
    ]
  },

  addCommands() {
    return {
      setQuestionBlock:
        () =>
        ({ commands }: { commands: { insertContent: (c: unknown) => boolean } }) =>
          commands.insertContent({
            type: this.name,
            content: [{ type: 'paragraph' }],
          }),
    } as never
  },
})
