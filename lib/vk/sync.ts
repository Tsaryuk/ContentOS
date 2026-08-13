// Sync VK community videos into vk_videos via video.get. Mirrors the YouTube
// sync: pull all videos for each active channel and upsert by (owner_id, id).

import { supabaseAdmin } from '@/lib/supabase'
import { getVkChannelToken, markVkNeedsReauth, VkAuthError } from '@/lib/vk/auth'
import { getOwnerVideos, VkApiError } from '@/lib/vk/client'

const PAGE_SIZE = 100

export async function syncVkChannel(channel: { id: string; vk_owner_id: number }): Promise<{ upserted: number }> {
  let token: string
  try {
    token = await getVkChannelToken(channel.id)
  } catch (err) {
    if (err instanceof VkAuthError) return { upserted: 0 }
    throw err
  }

  let offset = 0
  let upserted = 0
  while (true) {
    let page: Awaited<ReturnType<typeof getOwnerVideos>>
    try {
      page = await getOwnerVideos(channel.vk_owner_id, token, { count: PAGE_SIZE, offset })
    } catch (err) {
      // VK error 5 = "User authorization failed" → token is dead.
      if (err instanceof VkApiError && err.code === 5) await markVkNeedsReauth(channel.id)
      throw err
    }

    const items = page.items ?? []
    if (items.length === 0) break

    for (const v of items) {
      await supabaseAdmin.from('vk_videos').upsert(
        {
          channel_id: channel.id,
          vk_owner_id: v.owner_id,
          vk_video_id: v.id,
          current_title: v.title ?? null,
          current_description: v.description ?? null,
          duration_seconds: v.duration ?? null,
          views: v.views ?? null,
          published_at: v.date ? new Date(v.date * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'vk_owner_id,vk_video_id' },
      )
      upserted++
    }

    offset += PAGE_SIZE
    if (items.length < PAGE_SIZE || offset >= (page.count ?? 0)) break
  }

  return { upserted }
}

export async function syncAllVkChannels(): Promise<{ channels: number; upserted: number }> {
  const { data: channels } = await supabaseAdmin
    .from('vk_channels')
    .select('id, vk_owner_id')
    .eq('is_active', true)
    .not('access_token', 'is', null)

  let channelsDone = 0
  let upserted = 0
  for (const ch of channels ?? []) {
    try {
      const r = await syncVkChannel(ch)
      upserted += r.upserted
      channelsDone++
    } catch (err) {
      console.error(`[vk_sync] channel ${ch.id} failed:`, err instanceof Error ? err.message : err)
    }
  }
  return { channels: channelsDone, upserted }
}
