// Weekly cleanup of abandoned cover generations.
//
// Every generate-call writes a cover_generations row holding the ephemeral
// fal.ai URLs (which themselves die in ~24h). If the user never picks a
// variant, the row just sits there with dead URLs. This sweep deletes
// rows where picked_url IS NULL older than the retention window.
//
// Picked rows are KEPT indefinitely — they record which cover a piece of
// content actually got, reference a permanent storage URL, and are cheap.

import { supabaseAdmin } from '@/lib/supabase'
import { logger } from '@/lib/logger'

const RETENTION_DAYS = 30

export interface CoverCleanupResult {
  deleted: number
}

export async function runCoverCleanup(): Promise<CoverCleanupResult> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('cover_generations')
    .delete()
    .is('picked_url', null)
    .lt('created_at', cutoff)
    .select('id')

  if (error) {
    logger.warn({ err: error.message }, '[covers-cleanup] delete failed')
    return { deleted: 0 }
  }

  const deleted = data?.length ?? 0
  if (deleted > 0) {
    logger.info({ deleted, cutoff }, '[covers-cleanup] removed abandoned generations')
  }
  return { deleted }
}
