// Background sweep that recovers videos stuck in "actively running" states
// (transcribing / producing / publishing). If a worker process dies mid-job,
// the row would otherwise stay in that state until manual intervention —
// this resets it to 'error' with a clear timeout message, freeing the
// status machine for the next attempt.
//
// `generating` is intentionally NOT in the list: it's a *waiting* state
// (transcript done, user must click Generate). Killing it would silently
// rot videos with finished transcripts if the user steps away for 15+ min.
//
// Built as a factory so it can be unit-tested with a stub supabase client
// and so worker.ts's bespoke supabase init (env vars at boot time, not
// lib/supabase.ts's lazy proxy) keeps working.

import type { SupabaseClient } from '@supabase/supabase-js'

const STALE_TIMEOUT: Record<string, number> = {
  // Whisper chunks: long podcasts take 15+ min, so allow 30.
  transcribing: 30 * 60 * 1000,
  producing: 15 * 60 * 1000,
  publishing: 10 * 60 * 1000,
}

const THUMBNAIL_STALE_MS = 5 * 60 * 1000

interface Deps {
  supabase: SupabaseClient
  updateStatus: (videoId: string, status: string, errorMessage?: string) => Promise<void>
}

export function createStaleCleanup({ supabase, updateStatus }: Deps): () => Promise<void> {
  return async function cleanupStaleJobs(): Promise<void> {
    for (const [status, timeout] of Object.entries(STALE_TIMEOUT)) {
      const cutoff = new Date(Date.now() - timeout).toISOString()
      const { data: stale } = await supabase
        .from('yt_videos')
        .select('id, status, current_title')
        .eq('status', status)
        .lt('updated_at', cutoff)
      if (!stale?.length) continue

      for (const v of stale) {
        const mins = Math.round(timeout / 60000)
        console.log(`[cleanup] Resetting stale ${v.status} (>${mins}min): ${v.current_title?.slice(0, 50)}`)
        await updateStatus(v.id, 'error', `Таймаут: зависло на "${v.status}" более ${mins} минут`)
      }
    }

    // Clear stuck producer_output.thumbnail_generating flags older than 5 min.
    // Separate from the status table since it's a sub-state inside a JSONB
    // column, not a primary status transition.
    const thumbCutoff = new Date(Date.now() - THUMBNAIL_STALE_MS).toISOString()
    const { data: thumbStale } = await supabase
      .from('yt_videos')
      .select('id, producer_output, current_title')
      .not('producer_output->thumbnail_generating', 'is', null)
      .lt('updated_at', thumbCutoff)
    if (!thumbStale?.length) return

    for (const v of thumbStale) {
      const po = { ...(v.producer_output ?? {}), thumbnail_generating: null }
      await supabase.from('yt_videos').update({
        producer_output: po,
        updated_at: new Date().toISOString(),
      }).eq('id', v.id)
      console.log(`[cleanup] Cleared stuck thumbnail_generating: ${v.current_title?.slice(0, 50)}`)
    }
  }
}
