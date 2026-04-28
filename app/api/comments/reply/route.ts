import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { youtubeErrorResponse } from '@/lib/youtube/errors'
import { sendCommentReply, ReplyError } from '@/lib/youtube/comment-reply-engine'

interface ReplyRequest {
  commentId: string  // yt_comment_id
  text: string
  videoId: string    // yt_videos.id
  mode?: 'manual' | 'auto'
}

// POST /api/comments/reply — manual send. Auto-mode goes through the worker.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  let body: ReplyRequest
  try {
    body = (await req.json()) as ReplyRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { commentId, text, videoId, mode = 'manual' } = body
  if (!commentId || !text || !videoId) {
    return NextResponse.json({ error: 'commentId, text, videoId required' }, { status: 400 })
  }

  try {
    const result = await sendCommentReply({ ytCommentId: commentId, videoId, text, mode })
    return NextResponse.json({ success: true, replyId: result.replyId })
  } catch (err: unknown) {
    if (err instanceof ReplyError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('[comments/reply]', err instanceof Error ? err.message : err)
    return youtubeErrorResponse(err)
  }
}
