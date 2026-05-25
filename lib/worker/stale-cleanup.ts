// Background sweep that recovers videos stuck in "actively running" states.
// If a worker process dies mid-job (or BullMQ silently drops a continuation
// via a duplicate-jobId collision), the row would otherwise stay in that
// state until manual intervention — this resets it to 'error' with a clear
// timeout message, freeing the status machine for the next attempt.
//
// `generating` is in the list with a longer window: handleTranscribe ends
// by setting status='generating' as a "ready, waiting for the user click
// or for the scheduled produce retry" marker. In normal operation the
// retry produce job lands within ~2 minutes; if 90 minutes have passed
// the user either forgot OR the scheduled job was dropped (an exact
// scenario we hit before fix #100 in enqueue.ts). Either way, kicking
// it back to a re-runnable state is better than letting it rot silently.
// User can manually rerun produce from the UI as before.
//
// Built as a factory so it can be unit-tested with a stub supabase client
// and so worker.ts's bespoke supabase init (env vars at boot time, not
// lib/supabase.ts's lazy proxy) keeps working.

import type { SupabaseClient } from '@supabase/supabase-js'

const STALE_TIMEOUT: Record<string, number> = {
  // Whisper chunks: long podcasts take 15+ min, so allow 30.
  transcribing: 30 * 60 * 1000,
  // Producer runs Claude on the full transcript; under retry+rate-limit
  // can hit ~12 min. 30 covers the worst case with margin.
  generating: 30 * 60 * 1000,
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
