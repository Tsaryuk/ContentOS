// Публичный liveness-эндпоинт для ВНЕШНЕГО монитора.
//
// Существует отдельно от /api/health, потому что тот закрыт requireAuth — то
// есть недоступен монитору и бесполезен ровно в тот момент, когда логин лежит
// (а 29.07–13.08 логин как раз и лежал).
//
// Отдаёт 200, только если критичные проверки прошли, иначе 503: внешнему
// монитору нужен именно код ответа, а не текст. Наружу отдаём лишь имена
// упавших проверок, без деталей и хостов — подробности в /api/health.
import { NextResponse } from 'next/server'
import { runCriticalChecks } from '@/lib/health/checks'

export const dynamic = 'force-dynamic'

export async function GET() {
  const checks = await runCriticalChecks()
  const failed = checks.filter((c) => c.status === 'error').map((c) => c.name)

  if (failed.length > 0) {
    return NextResponse.json({ ok: false, failed }, { status: 503 })
  }
  return NextResponse.json({ ok: true }, { status: 200 })
}
