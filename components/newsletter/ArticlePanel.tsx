'use client'

import { useState } from 'react'
import { Image, Youtube, Eye, Smartphone, Monitor } from 'lucide-react'

interface ArticlePanelProps {
  articleHtml: string
  coverUrl: string
  youtubeUrl: string
  subject: string
  subtitle: string
  onUpdate: (fields: Record<string, any>) => void
}

type PreviewMode = 'edit' | 'desktop' | 'mobile'

export function ArticlePanel({ articleHtml, coverUrl, youtubeUrl, subject, subtitle, onUpdate }: ArticlePanelProps) {
  const [preview, setPreview] = useState<PreviewMode>('edit')

  function getYoutubeEmbedId(url: string): string | null {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?\s]+)/)
    return match ? match[1] : null
  }

  const embedId = youtubeUrl ? getYoutubeEmbedId(youtubeUrl) : null

  return (
    <div className="flex flex-col h-full">
      {/* Article meta */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-[10px] text-dim uppercase tracking-wider mb-1 block">Обложка</label>
            <div className="flex gap-2">
              <input
                placeholder="URL обложки (или сгенерировать)"
                value={coverUrl}
                onChange={e => onUpdate({ cover_url: e.target.value })}
                className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent"
              />
              <button
                className="px-3 py-1.5 bg-accent/10 text-accent rounded-lg text-xs hover:bg-accent/20 flex items-center gap-1.5"
                title="Генерация обложки (fal.ai)"
              >
                <Image className="w-3 h-3" />
                Генерировать
              </button>
            </div>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-dim uppercase tracking-wider mb-1 block">YouTube видео</label>
          <div className="flex gap-2">
            <input
              placeholder="https://youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={e => onUpdate({ youtube_url: e.target.value })}
              className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-xs text-cream focus:outline-none focus:border-accent"
            />
            {embedId && (
              <span className="px-2 py-1.5 text-[10px] text-green-400 flex items-center gap-1">
                <Youtube className="w-3 h-3" /> Привязано
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center px-4 py-2 border-b border-border/50">
        <div className="flex gap-1">
          {(['edit', 'desktop', 'mobile'] as const).map(m => (
            <button
              key={m}
              onClick={() => setPreview(m)}
              className={`px-2.5 py-1 rounded text-xs flex items-center gap-1.5 ${
                preview === m ? 'bg-accent/10 text-accent' : 'text-dim hover:text-muted'
              }`}
            >
              {m === 'edit' ? 'Редактор' : m === 'desktop' ? <><Monitor className="w-3 h-3" /> Desktop</> : <><Smartphone className="w-3 h-3" /> Mobile</>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {preview === 'edit' ? (
          <div
            contentEditable
            suppressContentEditableWarning
            className="p-6 min-h-full text-cream text-sm leading-relaxed focus:outline-none prose prose-invert max-w-none
              [&_h2]:text-xs [&_h2]:uppercase [&_h2]:tracking-wider [&_h2]:font-bold [&_h2]:text-accent [&_h2]:mt-8 [&_h2]:mb-3
              [&_blockquote]:border-l-2 [&_blockquote]:border-accent [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted
              [&_strong]:text-cream [&_a]:text-accent"
            dangerouslySetInnerHTML={{ __html: articleHtml || '<p style="color:#555">Расширенная версия статьи для блога...</p>' }}
            onBlur={e => onUpdate({ article_html: e.currentTarget.innerHTML })}
          />
        ) : (
          <div className="p-6 flex justify-center">
            <div className={`bg-black rounded-lg shadow-lg overflow-hidden ${
              preview === 'mobile' ? 'w-[375px]' : 'w-[680px]'
            }`}>
              <iframe
                srcDoc={`
                  <style>
                    *{margin:0;padding:0;box-sizing:border-box}
                    body{background:#000;color:#e8e8e8;font-family:'Lora',Georgia,serif;font-size:19px;line-height:1.75;-webkit-font-smoothing:antialiased}
                    .wrap{max-width:680px;margin:0 auto;padding:48px 24px}
                    h1{font-size:36px;font-weight:400;line-height:1.25;margin-bottom:12px;letter-spacing:-0.02em}
                    h2{font-family:'Inter',sans-serif;font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;margin:48px 0 16px;color:#e8e8e8}
                    p{margin-bottom:1.4em}
                    .sub{font-style:italic;font-size:18px;color:#888;margin-bottom:12px}
                    .date{font-family:'Inter',sans-serif;font-size:13px;color:#555;margin-bottom:40px}
                    blockquote{border-left:3px solid #1a4fff;padding:4px 0 4px 20px;margin:24px 0;font-style:italic;color:#888}
                    strong{color:#fff}
                    a{color:#888;border-bottom:1px dotted #555}
                    img.cover{width:100%;border-radius:8px;margin-bottom:40px}
                    .video{position:relative;padding-bottom:56.25%;height:0;margin:32px 0;border-radius:8px;overflow:hidden}
                    .video iframe{position:absolute;top:0;left:0;width:100%;height:100%;border:0}
                    .insight{border-left:3px solid #1a4fff;padding:4px 0 4px 20px;margin:32px 0}
                    .ins-label{font-family:'Inter',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#1a4fff;margin-bottom:6px}
                    .ins-text{font-style:italic;font-size:19px;line-height:1.5}
                    .qblock{border-top:1px solid #1a1a1a;border-bottom:1px solid #1a1a1a;padding:28px 0;margin:40px 0}
                    .q-label{font-family:'Inter',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#555;margin-bottom:10px}
                    .q-text{font-style:italic;font-size:22px;line-height:1.4}
                  </style>
                  <link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;600&display=swap" rel="stylesheet">
                  <div class="wrap">
                    ${coverUrl ? `<img class="cover" src="${coverUrl}" alt="">` : ''}
                    <h1>${subject || '[Заголовок]'}</h1>
                    <p class="sub">${subtitle || ''}</p>
                    <div class="date">Денис Царюк</div>
                    ${embedId ? `<div class="video"><iframe src="https://www.youtube.com/embed/${embedId}" allowfullscreen></iframe></div>` : ''}
                    ${articleHtml || '<p style="color:#555">Текст статьи...</p>'}
                  </div>
                `}
                className="w-full border-0"
                style={{ height: '80vh' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
