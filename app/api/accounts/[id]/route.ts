import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// DELETE /api/accounts/[id] — disconnect Google account
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  // Null out google_account_id on channels (keep channels, just unlink)
  await supabaseAdmin
    .from('yt_channels')
    .update({ google_account_id: null, refresh_token: null })
    .eq('google_account_id', id)

  // Delete the account
  const { error } = await supabaseAdmin
    .from('google_accounts')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
