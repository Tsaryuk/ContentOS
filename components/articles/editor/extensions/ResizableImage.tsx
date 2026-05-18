// Block image with a `size` attribute (S/M/L/Full) that constrains width within
// the article column. No floats, no wrapping — text always flows above/below.
// A React NodeView renders a small floating toolbar on selection with size
// presets and delete. The output HTML stays compatible with the static blog
// renderer at letters.tsaryuk.ru (keeps the .article-cover class, uses inline
// width, no aspect-ratio crop — letting the image keep its natural ratio).

import Image from '@tiptap/extension-image'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { mergeAttributes } from '@tiptap/core'

export type ImageSize = 'S' | 'M' | 'L' | 'Full'

const SIZE_TO_PCT: Record<ImageSize, number> = { S: 33, M: 50, L: 75, Full: 100 }

function widthStyle(size: ImageSize): string {
  return `width:${SIZE_TO_PCT[size]}%;max-width:100%;height:auto;display:block;margin:32px auto;border-radius:8px`
}

function ImageNodeView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const attrs = node.attrs as { src: string; alt?: string; size?: ImageSize }
  const size: ImageSize = attrs.size ?? 'Full'
  const baseStyle = widthStyle(size)
  return (
    <NodeViewWrapper
      as="div"
      className="article-image-wrapper"
      style={{
        position: 'relative',
        textAlign: 'center',
        outline: selected ? '2px solid #2d5a3f' : 'none',
        borderRadius: 8,
      }}
    >
      <img src={attrs.src} alt={attrs.alt ?? ''} className="article-cover" style={baseStyle as never} draggable={false} />
      {selected && (
        <div
          contentEditable={false}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            gap: 4,
            background: 'rgba(20,20,20,0.92)',
            border: '1px solid #2d5a3f',
            borderRadius: 6,
            padding: 4,
            zIndex: 10,
            fontSize: 11,
            fontFamily: 'Inter, sans-serif',
          }}
        >
          {(['S', 'M', 'L', 'Full'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                updateAttributes({ size: s })
              }}
              style={{
                padding: '2px 8px',
                background: size === s ? '#2d5a3f' : 'transparent',
                color: size === s ? '#fff' : '#bbb',
                border: 'none',
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault()
              deleteNode()
            }}
            style={{
              padding: '2px 8px',
              background: 'transparent',
              color: '#e74c3c',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
            aria-label="Удалить картинку"
          >
            ✕
          </button>
        </div>
      )}
    </NodeViewWrapper>
  )
}

export const ResizableImage = Image.extend({
  name: 'image',
  inline: false,
  group: 'block',
  draggable: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      size: {
        default: 'Full' as ImageSize,
        parseHTML: (el: HTMLElement): ImageSize => {
          const raw = el.getAttribute('data-size') as ImageSize | null
          if (raw && raw in SIZE_TO_PCT) return raw
          // Legacy images stored a hard width:100% inline; treat them as Full.
          return 'Full'
        },
        renderHTML: (attrs: { size?: ImageSize }) => ({
          'data-size': attrs.size ?? 'Full',
          style: widthStyle(attrs.size ?? 'Full'),
        }),
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(HTMLAttributes, { class: 'article-cover' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView)
  },
})
