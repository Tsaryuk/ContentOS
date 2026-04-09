// lib/youtube/errors.ts
// Shared error response helpers for YouTube API routes

import { NextResponse } from 'next/server'
import { YouTubeAuthError } from './auth'

export interface YouTubeErrorResponse {
  error: string
  code?: string
  channelId?: string | null
  needs_reauth?: boolean
}

/**
 * Convert any error thrown from YouTube-related code into a NextResponse.
 * Handles YouTubeAuthError with structured output so the UI can react properly.
 */
export function youtubeErrorResponse(err: unknown): NextResponse<YouTubeErrorResponse> {
  if (err instanceof YouTubeAuthError) {
    if (err.code === 'needs_reauth') {
      return NextResponse.json(
        {
          error: 'Канал требует переподключения к Google. Откройте настройки и нажмите «Подключить Google аккаунт».',
          code: 'needs_reauth',
          channelId: err.channelId,
          needs_reauth: true,
        },
        { status: 401 },
      )
    }
    if (err.code === 'no_token') {
      return NextResponse.json(
        {
          error: 'Для канала не сохранён refresh_token. Подключите Google-аккаунт в настройках.',
          code: 'no_token',
          channelId: err.channelId,
        },
        { status: 400 },
      )
    }
    return NextResponse.json(
      {
        error: 'Временная ошибка Google OAuth. Попробуйте позже.',
        code: 'network_error',
        channelId: err.channelId,
      },
      { status: 502 },
    )
  }

  const message = err instanceof Error ? err.message : 'Unknown error'
  return NextResponse.json({ error: message }, { status: 500 })
}
