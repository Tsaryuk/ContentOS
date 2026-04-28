import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { classifyComment } from '@/lib/youtube/comment-classifier'

// POST /api/comments/[id]/classify — run classifier inline (sync).
// `id` is yt_comments.id (UUID), not the YouTube comment id.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { id } = await params
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })

  try {
    const result = await classifyComment(id)
    return NextResponse.json({ success: true, classification: result })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
