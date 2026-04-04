import type { TelegramClient } from 'telegram'

/**
 * In-memory store for pending Telegram auth sessions.
 * Stores gramjs client instances during the phone→code→2FA flow.
 * Entries expire after 5 minutes.
 */
interface PendingEntry {
  client: TelegramClient
  expiresAt: number
}

const store = new Map<string, PendingEntry>()

export function setPendingAuth(phone: string, client: TelegramClient): void {
  cleanExpired()
  store.set(phone, {
    client,
    expiresAt: Date.now() + 5 * 60 * 1000,
  })
}

export function getPendingAuth(phone: string): TelegramClient | null {
  const entry = store.get(phone)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    store.delete(phone)
    return null
  }
  return entry.client
}

export function removePendingAuth(phone: string): void {
  store.delete(phone)
}

function cleanExpired(): void {
  const now = Date.now()
  for (const [key, val] of store) {
    if (val.expiresAt < now) store.delete(key)
  }
}
