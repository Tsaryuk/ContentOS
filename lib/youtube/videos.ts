// lib/youtube/videos.ts
// Читает видео канала с YouTube API — только чтение, без изменений

import { getYouTubeToken } from './auth'

export interface YTVideo {
  id: string
  title: string
  description: string
  tags: string[]
  thumbnail: string
  duration_seconds: number
  published_at: string
  view_count: number
  like_count: number
  privacy_status: string  // public | unlisted | private
}

// ISO 8601 → секунды (PT1H42M18S → 6138)
function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  return (parseInt(m[1] || '0') * 3600)
       + (parseInt(m[2] || '0') * 60)
       +  parseInt(m[3] || '0')
}

async function fetchVideoDetails(
  videoIds: string[],
  token: string,
): Promise<YTVideo[]> {
  const videos: YTVideo[] = []

  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50).join(',')
    const url = new URL('https://www.googleapis.com/youtube/v3/videos')
    url.searchParams.set('part', 'snippet,contentDetails,statistics,status')
    url.searchParams.set('id',   chunk)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.error) throw new Error(`YouTube API: ${data.error.message}`)

    for (const v of data.items || []) {
      const s = v.snippet
      videos.push({
        id:               v.id,
        title:            s.title,
        description:      s.description,
        tags:             s.tags || [],
        thumbnail:        s.thumbnails?.maxres?.url
                       || s.thumbnails?.high?.url
                       || s.thumbnails?.default?.url || '',
        duration_seconds: parseDuration(v.contentDetails?.duration || ''),
        published_at:     s.publishedAt,
        view_count:       parseInt(v.statistics?.viewCount || '0'),
        like_count:       parseInt(v.statistics?.likeCount || '0'),
        privacy_status:   v.status?.privacyStatus || 'public',
      })
    }
  }

  return videos
}

export async function fetchChannelVideos(channelId: string): Promise<YTVideo[]> {
  const token = await getYouTubeToken(channelId)

  // ─── Шаг 1: uploads playlist (все публичные + unlisted через плейлист) ───
  const uploadsId = 'UU' + channelId.slice(2)
  const playlistIds: string[] = []
  let pageToken = ''

  do {
    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems')
    url.searchParams.set('part',       'contentDetails')
    url.searchParams.set('playlistId', uploadsId)
    url.searchParams.set('maxResults', '50')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await res.json()
    if (data.error) throw new Error(`YouTube API: ${data.error.message}`)

    playlistIds.push(...(data.items || []).map((i: any) => i.contentDetails.videoId))
    pageToken = data.nextPageToken || ''
  } while (pageToken)

  // ─── Шаг 2: search.list forMine=true — ловим unlisted, которых нет в плейлисте ───
  const searchIds: string[] = []
  let searchPageToken = ''

  try {
    do {
      const url = new URL('https://www.googleapis.com/youtube/v3/search')
      url.searchParams.set('part',       'id')
      url.searchParams.set('forMine',    'true')
      url.searchParams.set('type',       'video')
      url.searchParams.set('maxResults', '50')
      if (searchPageToken) url.searchParams.set('pageToken', searchPageToken)

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      // search.list might fail if wrong account — silently skip
      if (data.error) break

      searchIds.push(...(data.items || []).map((i: any) => i.id.videoId))
      searchPageToken = data.nextPageToken || ''
    } while (searchPageToken)
  } catch {
    // search.list is optional — continue without it
  }

  // Merge: union of both sources, dedup
  const seen = new Set<string>()
  const allIds: string[] = []
  for (const id of [...playlistIds, ...searchIds]) {
    if (!seen.has(id)) { seen.add(id); allIds.push(id) }
  }

  // ─── Шаг 3: детали пачками по 50 ───
  return fetchVideoDetails(allIds, token)
}
