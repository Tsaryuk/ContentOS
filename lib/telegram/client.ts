import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'

const API_ID = Number(process.env.TELEGRAM_API_ID ?? '0')
const API_HASH = process.env.TELEGRAM_API_HASH ?? ''

// In-memory client cache: sessionString → connected client
const clients = new Map<string, TelegramClient>()

/**
 * Get or create a connected TelegramClient from a saved session string.
 */
export async function getTelegramClient(sessionString: string): Promise<TelegramClient> {
  const existing = clients.get(sessionString)
  if (existing?.connected) return existing

  const session = new StringSession(sessionString)
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 3,
  })

  await client.connect()
  clients.set(sessionString, client)
  return client
}

/**
 * Create a fresh client for auth flow (no saved session yet).
 */
export function createAuthClient(): TelegramClient {
  const session = new StringSession('')
  return new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 3,
  })
}

/**
 * Disconnect and remove a cached client.
 */
export async function disconnectClient(sessionString: string): Promise<void> {
  const client = clients.get(sessionString)
  if (client) {
    await client.disconnect()
    clients.delete(sessionString)
  }
}
