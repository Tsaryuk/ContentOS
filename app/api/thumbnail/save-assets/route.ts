import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL ?? '',
      process.env.SUPABASE_SERVICE_KEY ?? '',
    )

    const { videoId, photos, reference } = await req.json()
    if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 })

    const { data: video } = await supabase
      .from('yt_videos')
      .select('producer_output')
      .eq('id', videoId)
      .single()

    const po = video?.producer_output ?? {}
    const updated = {
      ...po,
      saved_photos: photos ?? po.saved_photos ?? [],
      saved_reference: reference ?? po.saved_reference ?? null,
    }

    await supabase.from('yt_videos').update({
      producer_output: updated,
      updated_at: new Date().toISOString(),
    }).eq('id', videoId)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
