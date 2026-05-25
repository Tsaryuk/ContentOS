// Project-scope authorisation for resource mutations.
//
// Until now every authenticated user could PATCH/DELETE any article,
// schedule any newsletter, upload to any Unisender campaign. The
// `requireAuth()` guard checked only that the request had a valid
// session — it did nothing about *which* project the resource belongs
// to. For the current single-owner setup this is mostly latent risk,
// but the moment a manager-role user is added, they could touch a
// project they were never assigned to (classic IDOR).
//
// The contract this module enforces:
//   - admin → access to any project's resource. Single-owner CMS use,
//     plus an escape hatch for the owner to cross-edit.
//   - manager (or any non-admin role) → only the project recorded in
//     `session.activeProjectId`. Other projects' rows are off-limits.
//
// Callers use `requireProjectAccess()` after loading the resource (we
// need the row's project_id to make the decision). If access is denied
// it returns a 403 NextResponse the route can return directly. On
// success it returns null and the route proceeds.

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

/**
 * @param resourceProjectId — `project_id` field of the loaded resource.
 *   Pass null/undefined when the row has no project_id (legacy rows
 *   created before multi-project support). Behaviour: legacy rows are
 *   admin-only; manager-role users see 403.
 * @returns 403 NextResponse if access denied, null if allowed.
 */
export async function requireProjectAccess(
  resourceProjectId: string | null | undefined,
): Promise<NextResponse | null> {
  const session = await getSession()
  if (session.userRole === 'admin') return null

  if (!resourceProjectId) {
    // Manager touching a legacy/unassigned row — refuse.
    return NextResponse.json(
      { error: 'Этот ресурс не привязан к проекту — обратись к админу' },
      { status: 403 },
    )
  }

  if (resourceProjectId !== session.activeProjectId) {
    return NextResponse.json(
      { error: 'Нет доступа к этому ресурсу' },
      { status: 403 },
    )
  }

  return null
}

/**
 * Helper for admin-only routes (channel-project assignment, project
 * CRUD). Already covered by `requireAdmin()` in lib/auth.ts, exported
 * here for callsites that want to assert without re-loading the session.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getSession()
  if (session.userRole !== 'admin') {
    return NextResponse.json({ error: 'Только админ' }, { status: 403 })
  }
  return null
}
