// Assigns the next sequential issue_number when a new nl_issues row is created.
//
// Used by both the manual "new issue" flow (app/api/newsletter/issues POST) and
// the "create email from article" flow (app/api/articles/[id]/to-email).
// Before this helper existed, issue_number defaulted to null and the editor
// header rendered "Письмо" / "-" instead of "Выпуск #N".
//
// Sequence is scoped per project. If no project is active, we use the global
// max across rows with NULL project_id so manual admin issues still increment.
// Concurrent inserts can theoretically collide; for single-user admin usage
// that's acceptable — the column allows duplicates, so no DB error, just a
// minor numbering glitch the user can fix by hand.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function nextIssueNumber(
  client: SupabaseClient,
  projectId: string | null,
): Promise<number> {
  let query = client
    .from('nl_issues')
    .select('issue_number')
    .not('issue_number', 'is', null)
    .order('issue_number', { ascending: false })
    .limit(1)

  if (projectId) {
    query = query.eq('project_id', projectId)
  } else {
    query = query.is('project_id', null)
  }

  const { data } = await query
  const current = data?.[0]?.issue_number
  return typeof current === 'number' && current >= 0 ? current + 1 : 1
}
