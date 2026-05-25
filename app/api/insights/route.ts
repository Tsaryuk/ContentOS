// Dashboard "AI Insights" bar — replaces the previously hard-coded
// counts with three real signals the author actually needs to see.
//
// Each insight is a (count, label, href, severity) — kept as a flat
// array so the bar component can render them dynamically when we add
// more later (sub-30% open rate, stuck drafts older than X, etc.).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export type InsightSeverity = 'info' | 'warn' | 'accent' | 'purple'

export interface Insight {
  key: string
  count: number
  label: string
  href: string
  severity: InsightSeverity
}

const STUCK_DRAFT_DAYS = 7

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const stuckThreshold = new Date(Date.now() - STUCK_DRAFT_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const [
    pendingComments,
    stuckArticles,
    stuckIssues,
  ] = await Promise.all([
    // Personal questions / disagreements that haven't been replied to.
    // We filter by classification.category in JSONB and status='new'.
    // Use head:true + count:'exact' for a count-only query.
    supabaseAdmin
      .from('yt_comments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'new')
      .eq('is_owner_reply', false)
      .is('skip_reason', null)
      .or(
        'classification->>category.eq.question,classification->>category.eq.disagreement,classification->>has_question.eq.true',
      ),
    supabaseAdmin
      .from('nl_articles')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft')
      .lt('updated_at', stuckThreshold),
    supabaseAdmin
      .from('nl_issues')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'draft')
      .lt('updated_at', stuckThreshold),
  ])

  const insights: Insight[] = []

  const pending = pendingComments.count ?? 0
  if (pending > 0) {
    insights.push({
      key: 'pending_comments',
      count: pending,
      label: pending === 1 ? 'комментарий ждёт ответа' : 'комментариев ждут ответа',
      href: '/comments',
      severity: 'accent',
    })
  }

  const stuckTotal = (stuckArticles.count ?? 0) + (stuckIssues.count ?? 0)
  if (stuckTotal > 0) {
    insights.push({
      key: 'stuck_drafts',
      count: stuckTotal,
      // Точно сформулирована мысль: «висят черновики» — нужно действие.
      // Линк ведёт в /articles; пользователь сам решит откуда копнуть.
      label: stuckTotal === 1 ? 'черновик висит больше недели' : 'черновиков висят больше недели',
      href: '/articles?filter=draft',
      severity: 'warn',
    })
  }

  // Placeholder — actual idea-tracking system would query an article_ideas
  // table once that ships. For now we just don't surface this insight.
  // The bar gracefully renders only the entries it has.

  return NextResponse.json({ insights })
}
