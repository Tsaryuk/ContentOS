import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'
import {
  buildTelegramGenerateSystemPrompt,
  buildTelegramGenerateUserPrompt,
} from '@/lib/telegram/prompts'

const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { channel_id, video_id, topic, tone } = await req.json()

    if (!channel_id) {
      return NextResponse.json({ error: 'Выберите канал' }, { status: 400 })
    }

    // Get channel info
    const { data: channel } = await supabaseAdmin
      .from('tg_channels')
      .select('title, username')
      .eq('id', channel_id)
      .single()

    if (!channel) {
      return NextResponse.json({ error: 'Канал не найден' }, { status: 404 })
    }

    // Get video info if linked
    let videoTitle: string | undefined
    let videoDescription: string | undefined

    if (video_id) {
      const { data: video } = await supabaseAdmin
        .from('yt_videos')
        .select('current_title, current_description, generated_description')
        .eq('id', video_id)
        .single()

      if (video) {
        videoTitle = video.current_title ?? undefined
        videoDescription = video.generated_description ?? video.current_description ?? undefined
      }
    }

    const msg = await anthropic.messages.create({
      model: AI_MODELS.claude,
      max_tokens: 2048,
      system: buildTelegramGenerateSystemPrompt(channel.title),
      messages: [{
        role: 'user',
        content: buildTelegramGenerateUserPrompt({
          topic,
          videoTitle,
          videoDescription,
          tone,
        }),
      }],
    })

    const content = msg.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')

    return NextResponse.json({ content })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ошибка AI-генерации'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
