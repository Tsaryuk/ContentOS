import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai-models'
import {
  buildTelegramSuggestSystemPrompt,
  buildTelegramSuggestUserPrompt,
} from '@/lib/telegram/prompts'

const anthropic = new Anthropic()

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { channel_id } = await req.json()

    if (!channel_id) {
      return NextResponse.json({ error: 'Выберите канал' }, { status: 400 })
    }

    // Get channel
    const { data: channel } = await supabaseAdmin
      .from('tg_channels')
      .select('title, project_id')
      .eq('id', channel_id)
      .single()

    if (!channel) {
      return NextResponse.json({ error: 'Канал не найден' }, { status: 404 })
    }

    // Get recent posts
    const { data: recentPosts } = await supabaseAdmin
      .from('tg_posts')
      .select('content, sent_at')
      .eq('channel_id', channel_id)
      .order('created_at', { ascending: false })
      .limit(10)

    // Get upcoming videos (in pipeline)
    let upcomingVideos: { title: string; status: string }[] = []
    if (channel.project_id) {
      const { data: channels } = await supabaseAdmin
        .from('yt_channels')
        .select('id')
        .eq('project_id', channel.project_id)

      const ytChannelIds = (channels ?? []).map(c => c.id)
      if (ytChannelIds.length > 0) {
        const { data: videos } = await supabaseAdmin
          .from('yt_videos')
          .select('current_title, status')
          .in('channel_id', ytChannelIds)
          .in('status', ['review', 'publishing', 'producing', 'generating'])
          .order('updated_at', { ascending: false })
          .limit(10)

        upcomingVideos = (videos ?? []).map(v => ({
          title: v.current_title ?? 'Untitled',
          status: v.status,
        }))
      }
    }

    const msg = await anthropic.messages.create({
      model: AI_MODELS.claude,
      max_tokens: 2048,
      system: buildTelegramSuggestSystemPrompt(),
      messages: [{
        role: 'user',
        content: buildTelegramSuggestUserPrompt({
          recentPosts: (recentPosts ?? []).map(p => ({
            content: p.content,
            sent_at: p.sent_at,
          })),
          upcomingVideos,
          channelTitle: channel.title,
        }),
      }],
    })

    const text = msg.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('')

    // Parse JSON response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ suggestions: [], raw: text })
    }

    try {
      const parsed = JSON.parse(jsonMatch[0])
      return NextResponse.json(parsed)
    } catch {
      return NextResponse.json({ suggestions: [], raw: text })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ошибка AI'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
