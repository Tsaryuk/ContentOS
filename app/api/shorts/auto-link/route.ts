import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// POST /api/shorts/auto-link
// 1. Parse youtube links from short descriptions -> set parent_video_id
// 2. Match guest name from short title -> find parent podcast by guest name
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { channelId } = await req.json()
    if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 })

    // Get all shorts for this channel
    const { data: shorts, error: sErr } = await supabaseAdmin
      .from('yt_videos')
      .select('id, yt_video_id, current_title, current_description, parent_video_id')
      .eq('channel_id', channelId)
      .lte('duration_seconds', 180)
      .gt('duration_seconds', 0)

    if (sErr) throw new Error(sErr.message)
    if (!shorts?.length) return NextResponse.json({ success: true, linked: 0, already: 0, unmatched: 0 })

    // Get all podcasts (long videos) for matching
    const { data: podcasts } = await supabaseAdmin
      .from('yt_videos')
      .select('id, yt_video_id, current_title')
      .eq('channel_id', channelId)
      .gt('duration_seconds', 180)

    const podcastByYtId = new Map((podcasts ?? []).map(p => [p.yt_video_id, p.id]))
    const podcastTitles = podcasts ?? []

    let linked = 0
    let already = 0
    let unmatched = 0
    const updates: { id: string; parent_video_id: string; guest_name: string | null }[] = []

    for (const short of shorts) {
      if (short.parent_video_id) { already++; continue }

      let parentId: string | null = null
      let guestName: string | null = null

      // Strategy 1: Parse YouTube link from description
      const desc = short.current_description ?? ''
      const linkMatch = desc.match(/(?:youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/shorts\/)([\w-]{11})/)
      if (linkMatch) {
        const ytId = linkMatch[1]
        parentId = podcastByYtId.get(ytId) ?? null
      }

      // Strategy 2: Match by guest name extracted from short title
      if (!parentId) {
        guestName = extractGuestName(short.current_title ?? '')
        if (guestName) {
          const nameLower = guestName.toLowerCase()
          const match = podcastTitles.find(p =>
            (p.current_title ?? '').toLowerCase().includes(nameLower)
          )
          if (match) parentId = match.id
        }
      }

      if (parentId) {
        updates.push({ id: short.id, parent_video_id: parentId, guest_name: guestName })
        linked++
      } else {
        unmatched++
      }
    }

    // Batch update
    for (const u of updates) {
      await supabaseAdmin
        .from('yt_videos')
        .update({
          parent_video_id: u.parent_video_id,
          ...(u.guest_name ? { guest_name: u.guest_name } : {}),
        })
        .eq('id', u.id)
    }

    return NextResponse.json({ success: true, linked, already, unmatched, total: shorts.length })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// Extract guest name from short title patterns:
// "Суть — Имя Фамилия, регалия #shorts"
// "Имя Фамилия: тезис"
// "текст — Имя Фамилия"
function extractGuestName(title: string): string | null {
  // Remove hashtags and emojis
  const clean = title.replace(/#\S+/g, '').replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{1F100}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F900}-\u{1F9FF}]|[\u{200D}]|[\u{20E3}]|[\u{FE0F}]|[☝️⬆️⤵️🚀❤️‍🩹🤧🚩💰👍]/gu, '').trim()

  // Pattern: "... — Имя Фамилия, регалия"
  const dashMatch = clean.match(/[—–-]\s*([А-ЯЁA-Z][а-яёa-z]+\s+[А-ЯЁA-Z][а-яёa-z]+)/)
  if (dashMatch) return dashMatch[1].trim()

  // Pattern: "Имя Фамилия: тезис" (at start)
  const colonMatch = clean.match(/^([А-ЯЁA-Z][а-яёa-z]+\s+[А-ЯЁA-Z][а-яёa-z]+)\s*:/)
  if (colonMatch) return colonMatch[1].trim()

  // Pattern: "текст с Имя Фамилия"
  const withMatch = clean.match(/(?:с|c)\s+([А-ЯЁA-Z][а-яёa-z]+(?:\s+[А-ЯЁA-Z][а-яёa-z]+)+)/)
  if (withMatch) return withMatch[1].trim()

  return null
}
