import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'
import { handleApiError } from '@/lib/api-error'

// PATCH /api/vk/channels/[id] — update a VK channel's rules (link block) or is_active.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const { id } = await params
    const body = await req.json()

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (body.rules !== undefined) patch.rules = body.rules
    if (typeof body.is_active === 'boolean') patch.is_active = body.is_active

    const { data, error } = await supabaseAdmin
      .from('vk_channels')
      .update(patch)
      .eq('id', id)
      .select('id, vk_owner_id, name, screen_name, photo_url, rules, needs_reauth, is_active')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err: unknown) {
    return handleApiError(err, { route: '/api/vk/channels/[id]', userId: auth.userId })
  }
}
