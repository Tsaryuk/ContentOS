// lib/youtube/auth.ts
// YouTube OAuth — получаем свежий access_token через refresh_token
// При invalid_grant помечаем канал needs_reauth = true, чтобы UI показал баннер

import { supabaseAdmin } from '@/lib/supabase'
import { decryptSecret } from '@/lib/crypto-secrets'

export type YouTubeAuthErrorCode =
  | 'needs_reauth'    // refresh_token отозван / истёк → нужно переподключение
  | 'no_token'        // нет refresh_token ни в БД, ни в env
  | 'network_error'   // сеть / неизвестная ошибка Google

export class YouTubeAuthError extends Error {
  code: YouTubeAuthErrorCode
  channelId: string | null
  detail: unknown

  constructor(code: YouTubeAuthErrorCode, message: string, channelId: string | null = null, detail: unknown = null) {
    super(message)
    this.name = 'YouTubeAuthError'
    this.code = code
    this.channelId = channelId
    this.detail = detail
  }
}

interface RefreshResult {
  access_token: string
}

async function refreshToken(refreshToken: string, channelId: string | null): Promise<RefreshResult> {
  let res: Response
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID!,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    })
  } catch (err) {
    throw new YouTubeAuthError('network_error', 'Network error contacting Google OAuth', channelId, err)
  }

  const data = await res.json().catch(() => ({}))

  if (data.access_token) {
    return { access_token: data.access_token }
  }

  // Detect permanent failures — refresh_token dead
  const error = data.error ?? ''
  const isPermanent =
    error === 'invalid_grant' ||
    error === 'unauthorized_client' ||
    error === 'invalid_client'

  if (isPermanent) {
    // Mark channel as needing reconnect
    if (channelId) {
      await supabaseAdmin
        .from('yt_channels')
        .update({ needs_reauth: true })
        .eq('id', channelId)
        .then(() => null, () => null)
    }
    throw new YouTubeAuthError(
      'needs_reauth',
      'YouTube refresh token is invalid or revoked. Reconnect the channel.',
      channelId,
      data,
    )
  }

  throw new YouTubeAuthError('network_error', `Google OAuth error: ${error || 'unknown'}`, channelId, data)
}

interface ChannelRef {
  id?: string            // internal UUID
  yt_channel_id?: string // YouTube channel ID (UCxxx)
}

/**
 * Get fresh access_token for a YouTube channel.
 * Accepts internal UUID (preferred) or yt_channel_id.
 * Throws YouTubeAuthError with specific error code on failure.
 * Clears needs_reauth flag on successful refresh.
 */
export async function getYouTubeToken(channelRef?: ChannelRef | string): Promise<string> {
  // Backward compat: string arg = yt_channel_id
  const ref: ChannelRef = typeof channelRef === 'string'
    ? { yt_channel_id: channelRef }
    : (channelRef ?? {})

  let channelUuid: string | null = null
  let refresh: string | null = null

  if (ref.id || ref.yt_channel_id) {
    const query = supabaseAdmin
      .from('yt_channels')
      .select('id, refresh_token')
      .limit(1)

    const { data } = ref.id
      ? await query.eq('id', ref.id).maybeSingle()
      : await query.eq('yt_channel_id', ref.yt_channel_id!).maybeSingle()

    if (data?.refresh_token) {
      channelUuid = data.id
      // Token may be encrypted (enc:v1:...) or legacy plaintext — decrypt handles both.
      refresh = decryptSecret(data.refresh_token)
    }
  }

  // Fallback to env var (no channel → no needs_reauth tracking)
  if (!refresh) {
    refresh = process.env.YOUTUBE_REFRESH_TOKEN ?? null
  }

  if (!refresh) {
    throw new YouTubeAuthError('no_token', 'No YouTube refresh token available', channelUuid)
  }

  const { access_token } = await refreshToken(refresh, channelUuid)

  // Success → clear needs_reauth if it was set
  if (channelUuid) {
    supabaseAdmin
      .from('yt_channels')
      .update({ needs_reauth: false })
      .eq('id', channelUuid)
      .eq('needs_reauth', true)
      .then(() => null, () => null)
  }

  return access_token
}
