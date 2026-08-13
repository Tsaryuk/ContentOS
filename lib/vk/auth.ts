// VK token resolution for a channel. VK offline tokens don't expire, so there
// is no refresh flow — we just decrypt the stored token. On a VK auth error
// (e.g. code 5 "User authorization failed") callers should mark the channel
// needs_reauth and prompt re-running /api/vk/oauth/start.

import { supabaseAdmin } from '@/lib/supabase'
import { decryptSecret } from '@/lib/crypto-secrets'

export class VkAuthError extends Error {
  constructor(
    message: string,
    public channelId?: string,
  ) {
    super(message)
    this.name = 'VkAuthError'
  }
}

/** Resolve the decrypted VK access token for a channel. */
export async function getVkChannelToken(channelId: string): Promise<string> {
  const { data: channel } = await supabaseAdmin
    .from('vk_channels')
    .select('id, access_token')
    .eq('id', channelId)
    .maybeSingle()

  if (!channel?.access_token) {
    throw new VkAuthError('VK-токен не подключён — нужно переподключить', channelId)
  }
  const token = decryptSecret(channel.access_token)
  if (!token) throw new VkAuthError('Не удалось расшифровать VK-токен', channelId)
  return token
}

/** Mark a channel as needing re-auth (called after a permanent VK auth error). */
export async function markVkNeedsReauth(channelId: string): Promise<void> {
  await supabaseAdmin
    .from('vk_channels')
    .update({ needs_reauth: true })
    .eq('id', channelId)
    .then(
      () => null,
      () => null,
    )
}
