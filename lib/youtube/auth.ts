// lib/youtube/auth.ts
// YouTube OAuth — получаем свежий access_token через refresh_token
// READ-ONLY scope: нет записи без явного approve

export async function getYouTubeToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN!,
      grant_type:    'refresh_token',
    }),
  })

  const data = await res.json()

  if (!data.access_token) {
    throw new Error(`YouTube OAuth failed: ${JSON.stringify(data)}`)
  }

  return data.access_token
}
