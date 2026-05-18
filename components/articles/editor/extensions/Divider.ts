// <hr class="divider"> — visual section break used in published articles.
// Extends StarterKit's HorizontalRule with the required class so output HTML
// matches the static blog renderer.

import HorizontalRule from '@tiptap/extension-horizontal-rule'

export const Divider = HorizontalRule.extend({
  renderHTML() {
    return ['hr', { class: 'divider' }]
  },
})
