// POST /api/covers/video/upload
// Uploads face/style reference photos to the thumbnails bucket, returns public
// URLs. Ported from the old /api/thumbnail/upload. Multipart: videoId + file0..N.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const formData = await req.formData()
    const videoId = formData.get('videoId') as string
    if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 })

    const urls: string[] = []
    const entries = Array.from(formData.entries()).filter(([k]) => k.startsWith('file'))

    for (let i = 0; i < entries.length; i++) {
      const file = entries[i][1] as File
      if (!file || typeof file === 'string') continue
      const buf = Buffer.from(await file.arrayBuffer())
      const ext = file.name.split('.').pop() ?? 'jpg'
      const fileName = `${videoId}/photo_${i}_${Date.now()}.${ext}`
      const { error } = await supabaseAdmin.storage
        .from('thumbnails')
        .upload(fileName, buf, { contentType: file.type, upsert: true })
      if (error) {
        console.error('[covers-video upload] error:', error.message)
        continue
      }
      const { data } = supabaseAdmin.storage.from('thumbnails').getPublicUrl(fileName)
      urls.push(data.publicUrl)
    }

    return NextResponse.json({ success: true, urls })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка загрузки'
    console.error('[covers-video upload]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
