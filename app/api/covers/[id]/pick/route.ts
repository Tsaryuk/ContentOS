// POST /api/covers/[id]/pick
// User chose one of the generated variants. We download from fal.ai,
// compress, upload to the per-kind storage bucket, mark the generation
// as picked, and return the storage URL. The caller (article editor,
// video page, …) writes the URL onto the target row itself, since the
// `cover_url` column lives on different tables per kind.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { pickCover } from '@/lib/covers/persist'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const schema = z.object({
  variant_kind: z.string().min(1).max(64),
})

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  if (!/^[0-9a-f-]{36}$/i.test(params.id)) {
    return NextResponse.json({ error: 'Bad id' }, { status: 400 })
  }

  let parsed: z.infer<typeof schema>
  try {
    parsed = schema.parse(await req.json())
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message ?? 'Bad input' : 'Bad JSON'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  try {
    const result = await pickCover(params.id, parsed.variant_kind)
    return NextResponse.json({ url: result.url, picked_kind: result.pickedKind })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка'
    console.error('[covers] pick:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
