import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { dbErrorResponse } from '@/lib/api-error'

// GET /api/accounts — list connected Google accounts
export async function GET(): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { data, error } = await supabaseAdmin
    .from('google_accounts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return dbErrorResponse(error, '/api/accounts')
  return NextResponse.json({ accounts: data ?? [] })
}
