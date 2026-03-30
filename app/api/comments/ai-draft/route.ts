import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

// POST /api/comments/ai-draft — generate AI reply draft
export async function POST(req: NextRequest) {
  try {
    const { commentId, videoId } = await req.json()
    if (!commentId || !videoId) {
      return NextResponse.json({ error: 'commentId, videoId required' }, { status: 400 })
    }

    // Get comment
    const { data: comment } = await supabaseAdmin
      .from('yt_comments')
      .select('*')
      .eq('yt_comment_id', commentId)
      .single()

    if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 })

    // Get video + channel for brand voice
    const { data: video } = await supabaseAdmin
      .from('yt_videos')
      .select('current_title, channel_id')
      .eq('id', videoId)
      .single()

    let brandVoice = ''
    if (video?.channel_id) {
      const { data: channel } = await supabaseAdmin
        .from('yt_channels')
        .select('rules, title')
        .eq('id', video.channel_id)
        .single()
      brandVoice = channel?.rules?.brand_voice ?? ''
    }

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      system: `Ты — автор YouTube-канала. Пиши ответы на комментарии коротко, дружелюбно, по-русски. ${brandVoice ? `Твой стиль: ${brandVoice}` : ''} Не используй эмодзи чрезмерно. Максимум 2-3 предложения.`,
      messages: [{
        role: 'user',
        content: `Видео: "${video?.current_title ?? ''}"

Комментарий от ${comment.author_name}:
"${comment.text}"

Напиши ответ на этот комментарий:`,
      }],
    })

    const draft = msg.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')

    // Save draft to DB
    await supabaseAdmin
      .from('yt_comments')
      .update({ ai_reply_draft: draft })
      .eq('yt_comment_id', commentId)

    return NextResponse.json({ success: true, draft })
  } catch (err: any) {
    console.error('[comments/ai-draft]', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
