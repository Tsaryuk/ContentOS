import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { dbErrorResponse } from '@/lib/api-error'

export async function GET() {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { data, error } = await supabaseAdmin
    .from('yt_videos')
    .select('id, current_title')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return dbErrorResponse(error, '/api/youtube/videos-list')
  }

  return NextResponse.json({ videos: data })
}
