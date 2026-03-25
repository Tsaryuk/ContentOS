import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getYouTubeToken } from '@/lib/youtube/auth'
import { updateVideoStatus, logJob, logChange, getVideoWithChannel } from '@/lib/process/helpers'

export async function POST(req: NextRequest) {
  let videoId: string | null = null

  try {
    const body = await req.json()
    videoId = body.videoId
    if (!videoId) {
      return NextResponse.json({ error: 'videoId required' }, { status: 400 })
    }

    const { video } = await getVideoWithChannel(videoId)

    // CRITICAL: approval check
    if (!video.is_approved) {
      return NextResponse.json(
        { error: 'Video must be approved before publishing' },
        { status: 403 }
      )
    }

    if (video.status !== 'review' && video.status !== 'error') {
      return NextResponse.json(
        { error: `Cannot publish video with status "${video.status}"` },
        { status: 400 }
      )
    }

    if (!video.generated_title || !video.generated_description) {
      return NextResponse.json(
        { error: 'Video has no generated content to publish' },
        { status: 400 }
      )
    }

    await updateVideoStatus(videoId, 'publishing')
    await logJob({ videoId, jobType: 'publish', status: 'running' })

    const token = await getYouTubeToken()

    // First get current video data from YouTube to preserve categoryId
    const getRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${video.yt_video_id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    if (!getRes.ok) {
      throw new Error(`YouTube GET failed: ${getRes.status}`)
    }

    const getData = await getRes.json()
    const currentSnippet = getData.items?.[0]?.snippet
    if (!currentSnippet) {
      throw new Error('Video not found on YouTube')
    }

    // Update video on YouTube
    const updateRes = await fetch(
      'https://www.googleapis.com/youtube/v3/videos?part=snippet',
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: video.yt_video_id,
          snippet: {
            title: video.generated_title,
            description: video.generated_description,
            tags: video.generated_tags ?? currentSnippet.tags,
            categoryId: currentSnippet.categoryId,
          },
        }),
      }
    )

    if (!updateRes.ok) {
      const errBody = await updateRes.text()
      throw new Error(`YouTube update failed ${updateRes.status}: ${errBody}`)
    }

    // Log changes
    const changes = [
      { field: 'title', old: video.current_title, new: video.generated_title },
      { field: 'description', old: video.current_description, new: video.generated_description },
    ]
    if (video.generated_tags) {
      changes.push({
        field: 'tags',
        old: JSON.stringify(video.current_tags),
        new: JSON.stringify(video.generated_tags),
      })
    }

    for (const change of changes) {
      await logChange({
        videoId,
        field: change.field,
        oldValue: change.old,
        newValue: change.new,
        source: 'ai',
      })
    }

    // Update DB
    const { error: updateErr } = await supabaseAdmin
      .from('yt_videos')
      .update({
        is_published_back: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId)

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`)

    await updateVideoStatus(videoId, 'done')
    await logJob({ videoId, jobType: 'publish', status: 'done', result: {
      published_title: video.generated_title,
    }})

    return NextResponse.json({
      success: true,
      published: {
        title: video.generated_title,
        yt_video_id: video.yt_video_id,
      },
    })

  } catch (err: any) {
    console.error('[publish]', err)
    if (videoId) {
      await updateVideoStatus(videoId, 'error', err.message).catch(() => {})
      await logJob({ videoId, jobType: 'publish', status: 'failed', error: err.message }).catch(() => {})
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
