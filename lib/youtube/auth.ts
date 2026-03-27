// lib/youtube/auth.ts
// YouTube OAuth — получаем свежий access_token через refresh_token
// Сначала проверяем refresh_token в DB, потом env var

import { supabaseAdmin } from '@/lib/supabase'

async function refreshToken(refreshToken: string): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })

  const data = await res.json()

  if (!data.access_token) {
    throw new Error(`YouTube OAuth failed: ${JSON.stringify(data)}`)
  }

  return data.access_token
}

export async function getYouTubeToken(channelId?: string): Promise<string> {
  // Try to get refresh_token from DB for this channel
  if (channelId) {
    try {
      const { data } = await supabaseAdmin
        .from('yt_channels')
        .select('refresh_token')
        .eq('yt_channel_id', channelId)
        .single()

      if (data?.refresh_token) {
        return refreshToken(data.refresh_token)
      }
    } catch {
      // fall through to env var
    }
  }

  // Fallback to env var
  const envToken = process.env.YOUTUBE_REFRESH_TOKEN
  if (!envToken) throw new Error('No YouTube refresh token available')
  return refreshToken(envToken)
}
