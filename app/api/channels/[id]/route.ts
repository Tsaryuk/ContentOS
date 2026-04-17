import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

// DELETE is destructive (removes a channel + cascades to videos/jobs) — admin only.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { id } = params
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('yt_channels')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
