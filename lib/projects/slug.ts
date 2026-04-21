// Shared slug derivation for the `projects` table so /api/projects POST
// (create) and /api/projects/[id] PATCH (rename) behave the same way and
// never 500 on a unique-constraint clash.
//
// Policy: slugify the name, and if another project already owns that slug,
// append -2, -3, ... until a free slot is found. Slug is internal (the UI
// shows the human name), so a silently-picked suffix is preferable to
// rejecting the user's operation.

import { supabaseAdmin } from '@/lib/supabase'

export function slugifyProjectName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

interface Options {
  /** Skip this id when checking uniqueness — used on rename so the project
   *  doesn't collide with its own current slug. */
  excludeId?: string
  /** Max suffix attempts before giving up (returns undefined). */
  maxAttempts?: number
}

/**
 * Returns a slug derived from `name` that is unique among `projects`.
 * Falls back through `slug`, `slug-2`, `slug-3`, … and returns `undefined`
 * if the sanitized name ends up empty (e.g. name was all punctuation).
 */
export async function buildUniqueProjectSlug(
  name: string,
  { excludeId, maxAttempts = 50 }: Options = {},
): Promise<string | undefined> {
  const base = slugifyProjectName(name)
  if (!base) return undefined

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    let query = supabaseAdmin.from('projects').select('id').eq('slug', candidate).limit(1)
    if (excludeId) query = query.neq('id', excludeId)
    const { data } = await query
    if (!data || data.length === 0) return candidate
  }
  // Very unlikely — fall back to a timestamp suffix so we still succeed.
  return `${base}-${Date.now().toString(36)}`
}
