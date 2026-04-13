import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

// PATCH /api/shorts/update
// Update one or many shorts inline (title, description, guest, parent, status)
export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { updates } = await req.json() as {
      updates: {
        id: string
        generated_title?: string
        generated_description?: string
        guest_name?: string
        guest_title?: string
        parent_video_id?: string | null
        shorts_status?: string
        is_approved?: boolean
      }[]
    }

    if (!updates?.length) return NextResponse.json({ error: 'updates required' }, { status: 400 })

    let updated = 0
    for (const u of updates) {
      const { id, ...fields } = u
      if (!id) continue

      const cleanFields: Record<string, unknown> = {}
      if (fields.generated_title !== undefined) cleanFields.generated_title = fields.generated_title
      if (fields.generated_description !== undefined) cleanFields.generated_description = fields.generated_description
      if (fields.guest_name !== undefined) cleanFields.guest_name = fields.guest_name
      if (fields.guest_title !== undefined) cleanFields.guest_title = fields.guest_title
      if (fields.parent_video_id !== undefined) cleanFields.parent_video_id = fields.parent_video_id
      if (fields.shorts_status !== undefined) cleanFields.shorts_status = fields.shorts_status
      if (fields.is_approved !== undefined) cleanFields.is_approved = fields.is_approved

      if (Object.keys(cleanFields).length === 0) continue

      const { error } = await supabaseAdmin
        .from('yt_videos')
        .update(cleanFields)
        .eq('id', id)

      if (!error) updated++
    }

    return NextResponse.json({ success: true, updated })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
