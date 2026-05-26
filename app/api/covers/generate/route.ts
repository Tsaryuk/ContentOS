// POST /api/covers/generate
// Universal cover generator endpoint. Used by article editor, video page,
// newsletter editor, etc. Selects style by id, kicks off the parallel
// fal.ai run via lib/covers/generate, returns the cover_generations id +
// variant URLs.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth'
import { getSession } from '@/lib/session'
import { rateLimit, clientIp, rateLimitResponse } from '@/lib/rate-limit'
import { generateCover, type TargetKind, type Aspect } from '@/lib/covers/generate'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

const TARGET_KINDS: TargetKind[] = [
  'article',
  'video',
  'newsletter',
  'telegram_post',
  'carousel',
  'podcast',
]
const ASPECTS: Aspect[] = ['16:9', '1:1', '9:16', '4:5', '3:2']

const schema = z.object({
  styleId: z.string().uuid(),
  targetKind: z.enum(TARGET_KINDS as [TargetKind, ...TargetKind[]]),
  targetId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1, 'Заголовок обязателен').max(500),
  description: z.string().trim().max(2000).optional(),
  customScene: z.string().trim().max(2000).optional(),
  aspect: z.enum(ASPECTS as [Aspect, ...Aspect[]]).optional(),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  // Each call fires N parallel fal.ai generations (~$0.04 per variant).
  // 5/min keeps the cost cap at ~$12/hour worst case even if a client loops.
  const rl = await rateLimit('ai:cover', clientIp(req), 5, 60)
  if (!rl.allowed) return rateLimitResponse(rl)

  let parsed: z.infer<typeof schema>
  try {
    const body = await req.json()
    parsed = schema.parse(body)
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues[0]?.message ?? 'Bad input' : 'Bad JSON'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const session = await getSession()
  const projectId = parsed.projectId ?? session.activeProjectId ?? null

  try {
    const result = await generateCover({
      styleId: parsed.styleId,
      targetKind: parsed.targetKind,
      targetId: parsed.targetId ?? null,
      projectId,
      title: parsed.title,
      description: parsed.description,
      customScene: parsed.customScene,
      aspect: parsed.aspect,
      createdBy: auth.userId,
    })

    return NextResponse.json({
      generation_id: result.generationId,
      style: { slug: result.styleSlug, name: result.styleName },
      scene: result.scene,
      variants: result.variants.map(({ kind, label, url }) => ({ kind, label, url })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка генерации'
    console.error('[covers] generate:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
