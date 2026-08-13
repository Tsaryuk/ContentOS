import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

// GET /api/vk/channels — list VK channels for the settings → ВК tab.
export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const { data, error } = await supabaseAdmin
    .from('vk_channels')
    .select('id, vk_owner_id, name, screen_name, photo_url, rules, needs_reauth, is_active')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ channels: data ?? [] })
}
