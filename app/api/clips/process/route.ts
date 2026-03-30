import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getQueue } from '@/lib/queue'

// POST /api/clips/process — start FFmpeg processing for approved clip
export async function POST(req: NextRequest) {
  try {
    const { candidateId } = await req.json()
    if (!candidateId) return NextResponse.json({ error: 'candidateId required' }, { status: 400 })

    const { data: candidate } = await supabaseAdmin
      .from('clip_candidates')
      .select('id, video_id, status')
      .eq('id', candidateId)
      .single()

    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 })
    if (candidate.status !== 'approved') {
      return NextResponse.json({ error: 'Candidate must be approved first' }, { status: 400 })
    }

    await supabaseAdmin
      .from('clip_candidates')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', candidateId)

    await getQueue().add('process_clip', { candidateId, videoId: candidate.video_id })

    return NextResponse.json({ success: true, status: 'queued' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
