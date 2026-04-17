/**
 * At-rest encryption for sensitive tokens (Google refresh_token,
 * Telegram session_string). AES-256-GCM with a key derived from SESSION_SECRET.
 *
 * Format: `enc:v1:<iv-b64>:<ciphertext-b64>:<tag-b64>`
 *
 * Transparent migration:
 *   - encryptSecret(plain)  → enc:v1:... (new format)
 *   - decryptSecret(value)  → detects prefix; returns plain as-is if unencrypted
 *     (so existing rows keep working until re-written)
 */

import crypto from 'crypto'

const PREFIX = 'enc:v1:'
const ALGO = 'aes-256-gcm'

let cachedKey: Buffer | null = null

function getKey(): Buffer {
  if (cachedKey) return cachedKey
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set and at least 32 chars')
  }
  // Derive a 32-byte key from the session secret. We use a fixed context salt
  // because rotating SESSION_SECRET would break existing encrypted values —
  // a proper rotation needs a separate re-encryption migration.
  cachedKey = crypto.scryptSync(secret, 'contentos-at-rest-v1', 32)
  return cachedKey
}

export function encryptSecret(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return null
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null
  if (!value.startsWith(PREFIX)) {
    // Legacy plaintext — return as-is. Will be re-encrypted on next write.
    return value
  }
  const [ivB64, ctB64, tagB64] = value.slice(PREFIX.length).split(':')
  if (!ivB64 || !ctB64 || !tagB64) {
    throw new Error('malformed encrypted secret')
  }
  const iv  = Buffer.from(ivB64,  'base64')
  const ct  = Buffer.from(ctB64,  'base64')
  const tag = Buffer.from(tagB64, 'base64')
  const key = getKey()
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const pt = Buffer.concat([decipher.update(ct), decipher.final()])
  return pt.toString('utf8')
}
