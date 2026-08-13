import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { dbErrorResponse } from '@/lib/api-error'

// DELETE /api/accounts/[id] — disconnect Google account (destructive, admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

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

  if (error) return dbErrorResponse(error, '/api/accounts/[id]')
  return NextResponse.json({ ok: true })
}
