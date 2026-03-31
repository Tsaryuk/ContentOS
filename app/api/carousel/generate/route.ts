import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { buildCarouselSystemPrompt, buildCarouselUserPrompt } from '@/lib/carousel/prompts'
import type { CarouselGenerateResult } from '@/lib/carousel/types'
import { AI_MODELS } from '@/lib/ai-models'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      topic,
      audience = '',
      tone = 'экспертный',
      slideCount = 10,
      preset = 'tsaryuk',
      projectId,
      channelId,
      videoId,
      voiceId,
      sourceText,
      carouselId,
    } = body

    if (!topic) {
      return NextResponse.json({ error: 'topic is required' }, { status: 400 })
    }

    // If creating from video, fetch transcript for context
    let transcript: string | undefined
    if (videoId) {
      const { data: video } = await supabaseAdmin
        .from('yt_videos')
        .select('transcript')
        .eq('id', videoId)
        .single()
      transcript = video?.transcript ?? undefined
    }

    // If voice style selected, fetch voice prompt
    let voicePrompt: string | undefined
    if (voiceId) {
      const { data: voice } = await supabaseAdmin
        .from('carousel_voices')
        .select('voice_prompt')
        .eq('id', voiceId)
        .single()
      voicePrompt = voice?.voice_prompt ?? undefined
    }

    // Create or reuse carousel record
    let id = carouselId
    if (!id) {
      const { data: carousel, error: insertErr } = await supabaseAdmin
        .from('carousels')
        .insert({
          topic,
          audience: audience || null,
          tone,
          preset,
          slide_count: slideCount,
          project_id: projectId || null,
          channel_id: channelId || null,
          video_id: videoId || null,
          voice_id: voiceId || null,
          source_text: sourceText || null,
          source_type: videoId ? 'video' : 'text',
          status: 'generating',
        })
        .select('id')
        .single()

      if (insertErr || !carousel) {
        throw new Error(`Failed to create carousel: ${insertErr?.message}`)
      }
      id = carousel.id
    } else {
      await supabaseAdmin.from('carousels').update({
        status: 'generating',
        updated_at: new Date().toISOString(),
      }).eq('id', id)
    }

    // Call Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const message = await anthropic.messages.create({
      model: AI_MODELS.claude,
      max_tokens: 6000,
      system: buildCarouselSystemPrompt(preset, voicePrompt),
      messages: [{
        role: 'user',
        content: buildCarouselUserPrompt({ topic, audience, tone, slideCount, transcript, sourceText }),
      }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let result: CarouselGenerateResult
    try {
      result = JSON.parse(clean)
    } catch {
      const jsonMatch = clean.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Claude returned invalid JSON')
      result = JSON.parse(jsonMatch[0])
    }

    // Save generated content
    await supabaseAdmin.from('carousels').update({
      slides: result.slides,
      caption: result.caption,
      hashtags: result.hashtags,
      illustration_prompt: result.illustrationPrompt,
      style: result.style ?? null,
      status: 'ready',
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    return NextResponse.json({
      success: true,
      id,
      slides: result.slides,
      caption: result.caption,
      hashtags: result.hashtags,
      illustrationPrompt: result.illustrationPrompt,
      style: result.style ?? null,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[carousel-generate]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
