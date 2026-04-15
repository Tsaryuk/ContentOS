// Lightweight draft autosave for white paper mode.
// Single UPDATE, no version bump, no republish, no fetch of current state.
// Called every 2-3 seconds while user types — must be cheap.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

interface DraftRequest {
  draft_text: string
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  try {
    const { draft_text }: DraftRequest = await req.json()

    if (typeof draft_text !== 'string') {
      return NextResponse.json({ error: 'draft_text required' }, { status: 400 })
    }

    // Single UPDATE, no SELECT, no republish
    const { error } = await supabaseAdmin
      .from('nl_articles')
      .update({ draft_text, updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Ошибка сохранения черновика' }, { status: 500 })
  }
}
