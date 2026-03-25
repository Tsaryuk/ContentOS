import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'
import { updateVideoStatus, logJob, logChange, getVideoWithChannel } from '@/lib/process/helpers'
import { buildSystemPrompt, buildUserPrompt } from '@/lib/process/prompts'

export const maxDuration = 120

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

export async function POST(req: NextRequest) {
  let videoId: string | null = null

  try {
    const body = await req.json()
    videoId = body.videoId
    if (!videoId) {
      return NextResponse.json({ error: 'videoId required' }, { status: 400 })
    }

    const { video, rules } = await getVideoWithChannel(videoId)

    if (!video.transcript) {
      return NextResponse.json({ error: 'Video has no transcript' }, { status: 400 })
    }

    if (video.status !== 'generating' && video.status !== 'error') {
      return NextResponse.json(
        { error: `Cannot generate for video with status "${video.status}"` },
        { status: 400 }
      )
    }

    await updateVideoStatus(videoId, 'generating')
    await logJob({ videoId, jobType: 'generate', status: 'running' })

    const message = await getAnthropic().messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: buildSystemPrompt(rules),
      messages: [{
        role: 'user',
        content: buildUserPrompt({
          currentTitle: video.current_title,
          currentDescription: video.current_description,
          transcript: video.transcript,
          durationSeconds: video.duration_seconds,
        }),
      }],
    })

    // Extract text from response
    const responseText = message.content
      .filter(block => block.type === 'text')
      .map(block => (block as any).text)
      .join('')

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Failed to parse JSON from Claude response')
    }

    const result = JSON.parse(jsonMatch[0])

    // Validate required fields
    if (!result.title || !result.description) {
      throw new Error('Missing required fields in AI response')
    }

    // Save to DB
    const updateData: Record<string, unknown> = {
      generated_title: result.title,
      generated_description: result.description,
      generated_tags: result.tags ?? [],
      generated_timecodes: result.timecodes ?? [],
      generated_clips: result.clips ?? [],
      ai_score: result.ai_score ?? null,
      updated_at: new Date().toISOString(),
    }

    const { error: updateErr } = await supabaseAdmin
      .from('yt_videos')
      .update(updateData)
      .eq('id', videoId)

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`)

    // Log changes
    const changes = [
      { field: 'title', old: video.current_title, new: result.title },
      { field: 'description', old: video.current_description, new: result.description },
      { field: 'tags', old: JSON.stringify(video.current_tags), new: JSON.stringify(result.tags) },
    ]

    for (const change of changes) {
      await logChange({
        videoId,
        field: change.field,
        oldValue: change.old,
        newValue: change.new,
        source: 'ai',
      })
    }

    await updateVideoStatus(videoId, 'thumbnail')
    await logJob({ videoId, jobType: 'generate', status: 'done', result: {
      title: result.title,
      tags_count: result.tags?.length ?? 0,
      timecodes_count: result.timecodes?.length ?? 0,
      clips_count: result.clips?.length ?? 0,
      ai_score: result.ai_score,
    }})

    return NextResponse.json({
      success: true,
      generated: {
        title: result.title,
        tags_count: result.tags?.length ?? 0,
        timecodes_count: result.timecodes?.length ?? 0,
        clips_count: result.clips?.length ?? 0,
        ai_score: result.ai_score,
      },
    })

  } catch (err: any) {
    console.error('[generate]', err)
    if (videoId) {
      await updateVideoStatus(videoId, 'error', err.message).catch(() => {})
      await logJob({ videoId, jobType: 'generate', status: 'failed', error: err.message }).catch(() => {})
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
