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
}

// ISO 8601 → секунды (PT1H42M18S → 6138)
function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!m) return 0
  return (parseInt(m[1] || '0') * 3600)
       + (parseInt(m[2] || '0') * 60)
       +  parseInt(m[3] || '0')
}

export async function fetchChannelVideos(channelId: string): Promise<YTVideo[]> {
  const token = await getYouTubeToken()

  // uploads playlist = UC → UU
  const uploadsId = 'UU' + channelId.slice(2)
  const videoIds: string[] = []
  let pageToken = ''

  // Шаг 1: все videoId через playlistItems (дешевле по квоте)
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

    videoIds.push(...(data.items || []).map((i: any) => i.contentDetails.videoId))
    pageToken = data.nextPageToken || ''
  } while (pageToken)

  // Шаг 2: детали пачками по 50
  const videos: YTVideo[] = []

  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50).join(',')
    const url = new URL('https://www.googleapis.com/youtube/v3/videos')
    url.searchParams.set('part', 'snippet,contentDetails,statistics')
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
      })
    }
  }

  return videos
}
