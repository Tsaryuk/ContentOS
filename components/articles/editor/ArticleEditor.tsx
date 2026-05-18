// TipTap-based replacement for the contentEditable+execCommand article editor.
// Imperative API stays close to the old one: parent passes `value` (HTML),
// `onChange` (debounced inside), and gets a ref with `getHTML()` for autosave.
//
// Why this exists: the old editor used document.execCommand('insertHTML', …)
// which is deprecated and behaves differently per browser, so image inserts
// dropped into <blockquote>/<div class="insight"> wrappers and broke layout.
// TipTap normalizes the document through a ProseMirror schema, so the legal
// shapes are enforced by the editor itself.

'use client'

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { ResizableImage } from './extensions/ResizableImage'
import { InsightBlock } from './extensions/InsightBlock'
import { QuestionBlock } from './extensions/QuestionBlock'
import { VideoEmbed } from './extensions/VideoEmbed'
import { Divider } from './extensions/Divider'
import {
  Bold, Italic, Heading2, Quote, Link2, Minus, Image as ImageIcon, Play, Lightbulb,
  MessageCircleQuestion, Undo2, Redo2, Sparkles, Upload, Loader2,
} from 'lucide-react'

export interface ArticleEditorHandle {
  getHTML: () => string
  focus: () => void
  insertImageUrl: (url: string, alt?: string) => void
  insertYoutubeUrl: (url: string) => boolean
}

interface ArticleEditorProps {
  value: string
  onChange: (html: string) => void
  articleId: string
  /** Optional YouTube URL — Insert-YouTube button reads this. */
  youtubeUrl?: string | null
  /** Callback to open the AI image-gen modal (kept external — uses existing UI). */
  onRequestAiImage?: () => void
}

export const ArticleEditor = forwardRef<ArticleEditorHandle, ArticleEditorProps>(
  function ArticleEditor({ value, onChange, articleId, youtubeUrl, onRequestAiImage }, ref) {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [uploading, setUploading] = useState(false)

    const editor = useEditor({
      // Render on the client only — TipTap's SSR is fine but the page already
      // gates the editor behind a loading state, so this just suppresses the
      // hydration mismatch warning Next 14 emits for contentEditable nodes.
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          horizontalRule: false, // replaced by custom Divider with class="divider"
          // Keep history (undo/redo) — TipTap groups inputs by transaction so
          // Cmd+Z undoes words/blocks instead of single keystrokes.
        }),
        Link.configure({ openOnClick: false, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
        Placeholder.configure({ placeholder: 'Начните писать статью...' }),
        ResizableImage,
        InsightBlock,
        QuestionBlock,
        VideoEmbed,
        Divider,
      ],
      content: value || '',
      onUpdate: ({ editor }) => onChange(editor.getHTML()),
      editorProps: {
        attributes: {
          class:
            'p-6 min-h-full text-foreground text-sm leading-relaxed focus:outline-none prose prose-invert max-w-none ' +
            '[&_h2]:text-xs [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:font-bold [&_h2]:text-accent [&_h2]:mt-8 [&_h2]:mb-3 ' +
            '[&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground ' +
            '[&_.insight]:border-l-2 [&_.insight]:border-accent [&_.insight]:pl-4 [&_.insight]:my-6 ' +
            '[&_.ins-label]:text-[10px] [&_.ins-label]:uppercase [&_.ins-label]:tracking-wider [&_.ins-label]:text-accent [&_.ins-label]:mb-1 ' +
            '[&_.ins-text]:italic [&_.ins-text]:text-foreground ' +
            '[&_.qblock]:border-y [&_.qblock]:border-border [&_.qblock]:py-5 [&_.qblock]:my-6 ' +
            '[&_.q-label]:text-[10px] [&_.q-label]:uppercase [&_.q-label]:tracking-wider [&_.q-label]:text-muted-foreground/60 [&_.q-label]:mb-2 ' +
            '[&_.q-text]:italic [&_.q-text]:text-lg [&_.q-text]:text-foreground ' +
            '[&_hr]:border-border [&_hr]:my-6 [&_strong]:text-foreground [&_a]:text-accent ' +
            '[&_.video-embed]:my-6 [&_.video-embed]:rounded-lg [&_.video-embed]:overflow-hidden ' +
            '[&_iframe]:w-full [&_iframe]:border-0',
        },
        // Drag-and-drop image upload: intercept dropped files and route through
        // the upload endpoint instead of letting the browser insert a file://
        // URL that the saved HTML can't reach.
        handleDrop(view, event, _slice, moved) {
          if (moved) return false
          const files = event.dataTransfer?.files
          if (!files?.length) return false
          const image = Array.from(files).find((f) => f.type.startsWith('image/'))
          if (!image) return false
          event.preventDefault()
          void uploadAndInsert(image)
          return true
        },
        handlePaste(view, event) {
          const items = event.clipboardData?.items
          if (!items?.length) return false
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              const file = item.getAsFile()
              if (file) {
                event.preventDefault()
                void uploadAndInsert(file)
                return true
              }
            }
          }
          return false
        },
      },
    })

    // Sync external `value` changes (e.g. after AI-formatter rewrites the
    // whole HTML or after autosave returns a server-massaged version). Avoid
    // resetting when the incoming HTML already matches what we have — that
    // would clobber the cursor on every keystroke.
    useEffect(() => {
      if (!editor) return
      const current = editor.getHTML()
      if (value && value !== current) {
        editor.commands.setContent(value, { emitUpdate: false })
      }
    }, [editor, value])

    useImperativeHandle(
      ref,
      () => ({
        getHTML: () => editor?.getHTML() ?? '',
        focus: () => editor?.commands.focus(),
        insertImageUrl: (url: string, alt?: string) => {
          editor?.chain().focus().insertContent({ type: 'image', attrs: { src: url, alt: alt ?? '', size: 'Full' } }).run()
        },
        insertYoutubeUrl: (url: string) => {
          if (!editor) return false
          const cmd = (editor.commands as unknown as { insertYoutube: (url: string) => boolean }).insertYoutube
          return cmd?.(url) ?? false
        },
      }),
      [editor],
    )

    async function uploadAndInsert(file: File): Promise<void> {
      if (!editor) return
      setUploading(true)
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('article_id', articleId)
        const res = await fetch('/api/articles/image/upload', { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok || !data.url) {
          alert('Ошибка загрузки: ' + (data.error ?? res.status))
          return
        }
        editor.chain().focus().insertContent({ type: 'image', attrs: { src: data.url, alt: '', size: 'Full' } }).run()
      } finally {
        setUploading(false)
      }
    }

    function insertYoutube(): void {
      if (!editor || !youtubeUrl) return
      const cmd = (editor.commands as unknown as { insertYoutube: (url: string) => boolean }).insertYoutube
      cmd?.(youtubeUrl)
    }

    function promptLink(): void {
      if (!editor) return
      const raw = window.prompt('URL:')
      if (!raw) return
      const trimmed = raw.trim()
      if (!trimmed) return
      const url = /^https?:\/\//i.test(trimmed) || trimmed.startsWith('mailto:') ? trimmed : `https://${trimmed}`
      if (editor.state.selection.empty) {
        editor.chain().focus().insertContent(`<a href="${url}">${url}</a>`).run()
      } else {
        editor.chain().focus().setLink({ href: url }).run()
      }
    }

    if (!editor) return null

    const btnBase = 'p-1.5 rounded hover:bg-accent/10 disabled:opacity-30 transition-colors'
    const btnActive = 'bg-accent/15 text-accent'

    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-1 flex-wrap p-2 border-b border-border bg-card/30 sticky top-0 z-20">
          <button title="Жирный (⌘B)" onClick={() => editor.chain().focus().toggleBold().run()}
            className={`${btnBase} ${editor.isActive('bold') ? btnActive : ''}`}><Bold className="w-4 h-4" /></button>
          <button title="Курсив (⌘I)" onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`${btnBase} ${editor.isActive('italic') ? btnActive : ''}`}><Italic className="w-4 h-4" /></button>
          <button title="Подзаголовок" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`${btnBase} ${editor.isActive('heading', { level: 2 }) ? btnActive : ''}`}><Heading2 className="w-4 h-4" /></button>
          <button title="Цитата" onClick={() => editor.chain().focus().toggleBlockquote().run()}
            className={`${btnBase} ${editor.isActive('blockquote') ? btnActive : ''}`}><Quote className="w-4 h-4" /></button>
          <button title="Ссылка" onClick={promptLink} className={btnBase}><Link2 className="w-4 h-4" /></button>
          <span className="w-px h-5 bg-border mx-1" />
          <button title="Загрузить картинку" onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className={btnBase}>
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          </button>
          {onRequestAiImage && (
            <button title="AI картинка" onClick={onRequestAiImage} className={btnBase}>
              <Sparkles className="w-4 h-4" />
            </button>
          )}
          {youtubeUrl && (
            <button title="Вставить YouTube" onClick={insertYoutube} className={btnBase}>
              <Play className="w-4 h-4" />
            </button>
          )}
          <span className="w-px h-5 bg-border mx-1" />
          <button title="Главная мысль" onClick={() => (editor.commands as unknown as { setInsightBlock: () => boolean }).setInsightBlock()}
            className={btnBase}><Lightbulb className="w-4 h-4" /></button>
          <button title="Вопрос" onClick={() => (editor.commands as unknown as { setQuestionBlock: () => boolean }).setQuestionBlock()}
            className={btnBase}><MessageCircleQuestion className="w-4 h-4" /></button>
          <button title="Разделитель" onClick={() => editor.chain().focus().setHorizontalRule().run()}
            className={btnBase}><Minus className="w-4 h-4" /></button>
          <span className="w-px h-5 bg-border mx-1" />
          <button title="Отмена (⌘Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}
            className={btnBase}><Undo2 className="w-4 h-4" /></button>
          <button title="Вернуть (⌘⇧Z)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}
            className={btnBase}><Redo2 className="w-4 h-4" /></button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (file) await uploadAndInsert(file)
            e.target.value = ''
          }}
        />
        <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
      </div>
    )
  },
)
