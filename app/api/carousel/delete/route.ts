import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // Delete exported files from storage
    const { data: carousel } = await supabaseAdmin
      .from('carousels')
      .select('id, export_urls, illustration_url')
      .eq('id', id)
      .single()

    if (!carousel) {
      return NextResponse.json({ error: 'Carousel not found' }, { status: 404 })
    }

    // Clean up storage files
    const { data: files } = await supabaseAdmin.storage
      .from('thumbnails')
      .list(id)

    if (files && files.length > 0) {
      const paths = files.map(f => `${id}/${f.name}`)
      await supabaseAdmin.storage.from('thumbnails').remove(paths)
    }

    // Delete record
    const { error } = await supabaseAdmin
      .from('carousels')
      .delete()
      .eq('id', id)

    if (error) throw new Error(error.message)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
