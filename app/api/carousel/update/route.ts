import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, slides, caption, hashtags } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (slides !== undefined) update.slides = slides
    if (caption !== undefined) update.caption = caption
    if (hashtags !== undefined) update.hashtags = hashtags

    const { error } = await supabaseAdmin
      .from('carousels')
      .update(update)
      .eq('id', id)

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
