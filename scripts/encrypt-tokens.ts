/**
 * One-off migration: encrypt plaintext refresh_token values in yt_channels
 * and session_string values in tg_channels.
 *
 * Historical context: the AES-256-GCM encryption for OAuth refresh tokens
 * and Telegram session strings was added later. The crypto layer is
 * transparent (decryptSecret detects the `enc:v1:` prefix and returns
 * plaintext as-is), but the plaintext rows are still at risk if the DB
 * is ever exfiltrated. This script rewrites them as encrypted ciphertext.
 *
 * Safe to run multiple times: rows that already start with `enc:v1:` are
 * skipped. Requires the same SESSION_SECRET used in the app (otherwise
 * later decryption would fail).
 *
 * Run on the VPS:
 *   cd /opt/contentos && node --import tsx scripts/encrypt-tokens.ts
 * (or via the tsx wrapper we already use for worker.ts)
 */

import { createClient } from '@supabase/supabase-js'
import { encryptSecret } from '../lib/crypto-secrets'

async function main() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY env vars')
    process.exit(1)
  }
  if (!process.env.SESSION_SECRET) {
    console.error('SESSION_SECRET must be set (same value the app uses)')
    process.exit(1)
  }

  const supabase = createClient(url, key)

  // ── YouTube refresh tokens ──────────────────────────────────────────────
  const { data: ytRows, error: ytErr } = await supabase
    .from('yt_channels')
    .select('id, title, refresh_token')
    .not('refresh_token', 'is', null)

  if (ytErr) {
    console.error('[yt_channels] fetch error:', ytErr.message)
    process.exit(1)
  }

  let ytEncrypted = 0
  let ytSkipped = 0
  for (const row of ytRows ?? []) {
    const token = row.refresh_token as string | null
    if (!token) { ytSkipped += 1; continue }
    if (token.startsWith('enc:v1:')) { ytSkipped += 1; continue }

    const encrypted = encryptSecret(token)
    if (!encrypted) { ytSkipped += 1; continue }

    const { error: updErr } = await supabase
      .from('yt_channels')
      .update({ refresh_token: encrypted })
      .eq('id', row.id)

    if (updErr) {
      console.error(`[yt_channels] ${row.title ?? row.id} update failed:`, updErr.message)
    } else {
      ytEncrypted += 1
      console.log(`[yt_channels] encrypted ${row.title ?? row.id}`)
    }
  }

  // ── Telegram session strings (live in tg_accounts, not tg_channels) ─────
  const { data: tgRows, error: tgErr } = await supabase
    .from('tg_accounts')
    .select('id, phone, session_string')
    .not('session_string', 'is', null)

  let tgEncrypted = 0
  let tgSkipped = 0
  if (tgErr) {
    console.warn('[tg_accounts] fetch error (skipping):', tgErr.message)
  } else {
    for (const row of tgRows ?? []) {
      const s = row.session_string as string | null
      if (!s) { tgSkipped += 1; continue }
      if (s.startsWith('enc:v1:')) { tgSkipped += 1; continue }

      const encrypted = encryptSecret(s)
      if (!encrypted) { tgSkipped += 1; continue }

      const { error: updErr } = await supabase
        .from('tg_accounts')
        .update({ session_string: encrypted })
        .eq('id', row.id)

      if (updErr) {
        console.error(`[tg_accounts] ${row.phone ?? row.id} update failed:`, updErr.message)
      } else {
        tgEncrypted += 1
        console.log(`[tg_accounts] encrypted ${row.phone ?? row.id}`)
      }
    }
  }

  console.log(`\nDone. yt_channels encrypted=${ytEncrypted} skipped=${ytSkipped}, tg_accounts encrypted=${tgEncrypted} skipped=${tgSkipped}`)
}

main().catch(err => {
  console.error('Fatal:', err instanceof Error ? err.stack : err)
  process.exit(1)
})
