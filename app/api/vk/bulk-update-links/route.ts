import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { enqueueProcessJob } from '@/lib/process/enqueue'
import { buildChannelLinkBlock } from '@/lib/youtube/description-links'
import { handleApiError } from '@/lib/api-error'

// Bulk-update descriptions of a VK channel's videos via video.edit.
//
// Body:
//   { channelId, op: 'rebuild_block' }                 — re-apply the link block
//   { channelId, op: 'replace_url', fromUrl, toUrl }   — swap one link for another
//
// Each video gets a `vk_update_video` job, staggered 3s (VK user-token rate limit).
export async function POST(req: NextRequest) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const body = await req.json()
    const { channelId, op } = body

    if (!channelId || typeof channelId !== 'string') {
      return NextResponse.json({ error: 'channelId required' }, { status: 400 })
    }
    if (op !== 'rebuild_block' && op !== 'replace_url') {
      return NextResponse.json({ error: "op must be 'rebuild_block' or 'replace_url'" }, { status: 400 })
    }

    const { data: channel } = await supabaseAdmin
      .from('vk_channels')
      .select('id, rules')
      .eq('id', channelId)
      .maybeSingle()
    if (!channel) return NextResponse.json({ error: 'Канал не найден' }, { status: 404 })

    let jobData: Record<string, unknown>
    if (op === 'rebuild_block') {
      const linkBlock = buildChannelLinkBlock((channel.rules as Record<string, unknown> | null) ?? null)
      if (!linkBlock.trim()) {
        return NextResponse.json({ error: 'У канала не задан блок ссылок (required_links / channel_links)' }, { status: 400 })
      }
      jobData = { op, linkBlock }
    } else {
      const { fromUrl, toUrl } = body
      if (!fromUrl || typeof fromUrl !== 'string') {
        return NextResponse.json({ error: 'fromUrl обязателен для replace_url' }, { status: 400 })
      }
      jobData = { op, fromUrl, toUrl: typeof toUrl === 'string' ? toUrl : '' }
    }

    const { data: videos } = await supabaseAdmin
      .from('vk_videos')
      .select('id')
      .eq('channel_id', channelId)
    if (!videos?.length) return NextResponse.json({ success: true, enqueued: 0 })

    let enqueued = 0
    for (const v of videos) {
      await enqueueProcessJob(
        'vk_update_video',
        v.id,
        { videoId: v.id, ...jobData },
        { attempts: 1, delay: enqueued * 3000 },
      )
      enqueued++
    }

    return NextResponse.json({ success: true, enqueued })
  } catch (err: unknown) {
    return handleApiError(err, { route: '/api/vk/bulk-update-links', userId: auth.userId })
  }
}
