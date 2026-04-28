import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

// POST /api/comments/[id]/skip — manually hide a comment from the reply queue.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const body = await req.json().catch(() => ({}))
  const reason = typeof body?.reason === 'string' ? body.reason : 'manual'

  const { error } = await supabaseAdmin
    .from('yt_comments')
    .update({ status: 'hidden', skip_reason: reason })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
