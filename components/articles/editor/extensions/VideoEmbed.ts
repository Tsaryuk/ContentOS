// Custom TipTap leaf node for the YouTube embed wrapper used in articles:
// <div class="video-embed"><iframe src="https://www.youtube.com/embed/<id>" …></iframe></div>
// Stored as a single atom node with a `videoId` attribute. Edit-disabled inside.

import { Node, mergeAttributes } from '@tiptap/core'

interface VideoEmbedAttrs {
  videoId: string
}

const YOUTUBE_ID_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?\s]+)/

export const VideoEmbed = Node.create({
  name: 'videoEmbed',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      videoId: {
        default: '',
        parseHTML: (el: HTMLElement) => {
          const iframe = el.querySelector('iframe')
          const src = iframe?.getAttribute('src') ?? ''
          const m = src.match(/\/embed\/([^?&\s]+)/)
          return m?.[1] ?? ''
        },
        renderHTML: (attrs: VideoEmbedAttrs) => ({ 'data-video-id': attrs.videoId }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div.video-embed' }]
  },

  renderHTML({ HTMLAttributes, node }) {
    const videoId = (node.attrs as VideoEmbedAttrs).videoId
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'video-embed', contenteditable: 'false' }),
      [
        'iframe',
        {
          src: `https://www.youtube.com/embed/${videoId}`,
          allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
          allowfullscreen: '',
          style: 'width:100%;aspect-ratio:16/9;border:0;border-radius:8px',
        },
      ],
    ]
  },

  addCommands() {
    return {
      insertYoutube:
        (url: string) =>
        ({ commands }: { commands: { insertContent: (c: unknown) => boolean } }) => {
          const match = url.match(YOUTUBE_ID_RE)
          if (!match) return false
          return commands.insertContent({ type: this.name, attrs: { videoId: match[1] } })
        },
    } as never
  },
})
