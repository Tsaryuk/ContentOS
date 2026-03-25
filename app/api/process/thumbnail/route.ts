import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { updateVideoStatus, logJob, getVideoWithChannel } from '@/lib/process/helpers'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  let videoId: string | null = null

  try {
    const body = await req.json()
    videoId = body.videoId
    if (!videoId) {
      return NextResponse.json({ error: 'videoId required' }, { status: 400 })
    }

    const { video } = await getVideoWithChannel(videoId)

    if (!video.generated_title) {
      return NextResponse.json({ error: 'Video has no generated title' }, { status: 400 })
    }

    if (video.status !== 'thumbnail' && video.status !== 'error') {
      return NextResponse.json(
        { error: `Cannot generate thumbnail for video with status "${video.status}"` },
        { status: 400 }
      )
    }

    await updateVideoStatus(videoId, 'thumbnail')
    await logJob({ videoId, jobType: 'thumbnail', status: 'running' })

    // Build prompt from generated content
    const prompt = `YouTube thumbnail, professional, high quality, bold text overlay: "${video.generated_title}". Topic: ${video.generated_description?.slice(0, 200) ?? video.current_title}. Style: modern, eye-catching, bright colors, clean design.`

    // Call Recraft API
    const recraftRes = await fetch('https://external.api.recraft.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RECRAFT_API_KEY}`,
      },
      body: JSON.stringify({
        prompt,
        style: 'realistic_image',
        size: '1365x1024',
        n: 1,
      }),
    })

    if (!recraftRes.ok) {
      const errBody = await recraftRes.text()
      throw new Error(`Recraft API error ${recraftRes.status}: ${errBody}`)
    }

    const recraftData = await recraftRes.json()
    const imageUrl = recraftData.data?.[0]?.url

    if (!imageUrl) {
      throw new Error('No image URL in Recraft response')
    }

    // Download image
    const imageRes = await fetch(imageUrl)
    if (!imageRes.ok) throw new Error('Failed to download generated image')
    const imageBuffer = Buffer.from(await imageRes.arrayBuffer())

    // Upload to Supabase Storage
    const fileName = `${videoId}.png`
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('thumbnails')
      .upload(fileName, imageBuffer, {
        contentType: 'image/png',
        upsert: true,
      })

    if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`)

    // Get public URL
    const { data: publicUrlData } = supabaseAdmin.storage
      .from('thumbnails')
      .getPublicUrl(fileName)

    const thumbnailUrl = publicUrlData.publicUrl

    // Save to DB
    const { error: updateErr } = await supabaseAdmin
      .from('yt_videos')
      .update({
        thumbnail_url: thumbnailUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', videoId)

    if (updateErr) throw new Error(`DB update failed: ${updateErr.message}`)

    await updateVideoStatus(videoId, 'review')
    await logJob({ videoId, jobType: 'thumbnail', status: 'done', result: {
      thumbnail_url: thumbnailUrl,
    }})

    return NextResponse.json({
      success: true,
      thumbnail_url: thumbnailUrl,
    })

  } catch (err: any) {
    console.error('[thumbnail]', err)
    if (videoId) {
      await updateVideoStatus(videoId, 'error', err.message).catch(() => {})
      await logJob({ videoId, jobType: 'thumbnail', status: 'failed', error: err.message }).catch(() => {})
    }
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
