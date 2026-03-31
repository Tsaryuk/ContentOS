import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { AI_MODELS } from '@/lib/ai-models'
import { buildVoiceTrainingPrompt } from '@/lib/carousel/prompts'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { examples, name, projectId } = body

    if (!examples || !Array.isArray(examples) || examples.length < 2) {
      return NextResponse.json({ error: 'At least 2 text examples required' }, { status: 400 })
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const userPrompt = examples
      .map((ex: string, i: number) => `--- Пример ${i + 1} ---\n${ex}`)
      .join('\n\n')

    const message = await anthropic.messages.create({
      model: AI_MODELS.claude,
      max_tokens: 2000,
      system: buildVoiceTrainingPrompt(),
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text : ''
    const clean = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

    let result: { voicePrompt: string; summary: string }
    try {
      result = JSON.parse(clean)
    } catch {
      const jsonMatch = clean.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Claude returned invalid JSON')
      result = JSON.parse(jsonMatch[0])
    }

    const { data: voice, error: insertErr } = await supabaseAdmin
      .from('carousel_voices')
      .insert({
        name: name || 'Мой стиль',
        examples,
        voice_prompt: result.voicePrompt,
        summary: result.summary,
        project_id: projectId || null,
      })
      .select('id, name, summary, voice_prompt')
      .single()

    if (insertErr || !voice) {
      throw new Error(`Failed to save voice: ${insertErr?.message}`)
    }

    return NextResponse.json({
      success: true,
      voice,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[train-voice]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId')

  let query = supabaseAdmin
    .from('carousel_voices')
    .select('id, name, summary, created_at')
    .order('created_at', { ascending: false })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ voices: data ?? [] })
}
