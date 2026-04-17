import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireAdmin } from '@/lib/auth'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const days = Math.max(1, Math.min(90, Number(req.nextUrl.searchParams.get('days')) || 30))
  const sinceIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('ai_usage')
    .select('provider, model, task, input_tokens, output_tokens, units, cost_usd, created_at, video_id')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = data ?? []

  // Aggregate: by day × provider × task
  const byDay = new Map<string, number>()
  const byProvider = new Map<string, { count: number; cost: number }>()
  const byTask = new Map<string, { count: number; cost: number }>()
  const byModel = new Map<string, { count: number; cost: number; inputTokens: number; outputTokens: number; units: number }>()
  let totalCost = 0
  let withCost = 0

  for (const r of rows) {
    const day = r.created_at.slice(0, 10)
    const cost = Number(r.cost_usd ?? 0)
    totalCost += cost
    if (r.cost_usd !== null) withCost += 1

    byDay.set(day, (byDay.get(day) ?? 0) + cost)

    const pv = byProvider.get(r.provider) ?? { count: 0, cost: 0 }
    pv.count += 1; pv.cost += cost
    byProvider.set(r.provider, pv)

    const tk = r.task ?? 'other'
    const tv = byTask.get(tk) ?? { count: 0, cost: 0 }
    tv.count += 1; tv.cost += cost
    byTask.set(tk, tv)

    const mv = byModel.get(r.model) ?? { count: 0, cost: 0, inputTokens: 0, outputTokens: 0, units: 0 }
    mv.count += 1
    mv.cost += cost
    mv.inputTokens  += r.input_tokens  ?? 0
    mv.outputTokens += r.output_tokens ?? 0
    mv.units        += r.units         ?? 0
    byModel.set(r.model, mv)
  }

  const toSortedArray = <V>(m: Map<string, V>, sortKey: (v: V) => number = () => 0) =>
    Array.from(m.entries())
      .map(([key, value]) => ({ key, ...(value as any) }))
      .sort((a, b) => sortKey(b) - sortKey(a))

  return NextResponse.json({
    days,
    since: sinceIso,
    totalEvents: rows.length,
    eventsWithCost: withCost,
    totalCostUsd: Number(totalCost.toFixed(2)),
    byDay: Array.from(byDay.entries())
      .map(([day, cost]) => ({ day, cost: Number(cost.toFixed(4)) }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    byProvider: toSortedArray(byProvider, v => (v as { cost: number }).cost),
    byTask:     toSortedArray(byTask,     v => (v as { cost: number }).cost),
    byModel:    toSortedArray(byModel,    v => (v as { cost: number }).cost),
    recent: rows.slice(0, 50),
  })
}
