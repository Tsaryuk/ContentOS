/**
 * GET /api/podcasts — list all shows (admin only).
 * Returns minimal metadata needed to render the /settings → Подкасты tab.
 */

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { dbErrorResponse } from '@/lib/api-error'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { data, error } = await supabaseAdmin
    .from('podcast_shows')
    .select('id, channel_id, slug, title, description, author, owner_email, owner_name, language, category, subcategory, cover_url, cover_style_prompt, explicit, default_trim_start_sec, default_trim_end_sec, auto_publish, is_active, created_at, updated_at')
    .order('title')

  if (error) return dbErrorResponse(error, '/api/podcasts')
  return NextResponse.json({ shows: data ?? [] })
}
