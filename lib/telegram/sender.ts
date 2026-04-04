import { supabaseAdmin } from '@/lib/supabase'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { Api } from 'telegram'
import bigInt from 'big-integer'
import type { TgPostRow } from './types'

const API_ID = Number(process.env.TELEGRAM_API_ID ?? '0')
const API_HASH = process.env.TELEGRAM_API_HASH ?? ''

const supabase = supabaseAdmin

/**
 * Send a Telegram post to its channel.
 * Called by the worker process.
 */
export async function sendTelegramPost(postId: string): Promise<void> {
  // 1. Get post with channel and account
  const { data: post, error: postErr } = await supabase
    .from('tg_posts')
    .select(`
      *,
      channel:tg_channels!channel_id(
        id, tg_channel_id, title, username,
        account:tg_accounts!tg_account_id(id, session_string)
      )
    `)
    .eq('id', postId)
    .single()

  if (postErr || !post) {
    throw new Error(`Пост ${postId} не найден: ${postErr?.message}`)
  }

  const channel = post.channel as any
  const account = channel?.account

  if (!account?.session_string) {
    await markFailed(postId, 'Telegram-аккаунт не авторизован')
    return
  }

  // 2. Create client and connect
  const session = new StringSession(account.session_string)
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 3,
  })
  await client.connect()

  try {
    // 3. Resolve channel entity using PeerChannel
    const peer = new Api.PeerChannel({ channelId: bigInt(channel.tg_channel_id) })
    const entity = await client.getEntity(peer)

    // 4. Send message
    let messageId: number | undefined

    if (post.media_urls && post.media_urls.length > 0) {
      // Send with media
      const result = await client.sendFile(entity, {
        file: post.media_urls[0],
        caption: post.content,
        parseMode: 'html',
      })
      messageId = result.id
    } else {
      // Text-only message
      const result = await client.sendMessage(entity, {
        message: post.content,
        parseMode: 'html',
      })
      messageId = result.id
    }

    // 5. Update post as sent
    await supabase
      .from('tg_posts')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        tg_message_id: messageId ?? null,
        error: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ошибка отправки'
    await markFailed(postId, message)
    throw err
  } finally {
    await client.disconnect()
  }
}

async function markFailed(postId: string, error: string): Promise<void> {
  await supabase
    .from('tg_posts')
    .update({
      status: 'failed',
      error,
      updated_at: new Date().toISOString(),
    })
    .eq('id', postId)
}
