// Article ↔ Email linkage endpoint.
//
// On the article page we want to surface "is this article sent as a newsletter
// already, and how did it land". The data is split across three tables:
//   nl_articles.email_issue_id  →  nl_issues.id   →  nl_campaigns (1-to-N, latest wins)
// so this route does the join in one place and returns a flat, UI-friendly
// shape. No new fields in the DB.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export interface ArticleEmailStatus {
  hasIssue: boolean
  issue: null | {
    id: string
    issueNumber: number | null
    subject: string
    status: string | null
    scheduledAt: string | null
    sentAt: string | null
  }
  campaign: null | {
    id: string
    unisenderCampaignId: number | null
    unisenderMessageId: number | null
    status: string | null
    totalSent: number | null
    totalDelivered: number | null
    totalOpened: number | null
    totalClicked: number | null
    totalUnsubscribed: number | null
    openRate: number | null
    clickRate: number | null
    statsFetchedAt: string | null
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  const { id } = await params

  const { data: article, error: articleErr } = await supabaseAdmin
    .from('nl_articles')
    .select('email_issue_id')
    .eq('id', id)
    .single()

  if (articleErr || !article) {
    return NextResponse.json({ error: 'Статья не найдена' }, { status: 404 })
  }

  const empty: ArticleEmailStatus = { hasIssue: false, issue: null, campaign: null }
  if (!article.email_issue_id) {
    return NextResponse.json(empty)
  }

  const { data: issue } = await supabaseAdmin
    .from('nl_issues')
    .select('id, issue_number, subject, status, scheduled_at, sent_at')
    .eq('id', article.email_issue_id)
    .single()

  if (!issue) {
    // Dangling FK — article points to deleted issue. Treat as unsent so UI
    // doesn't get stuck on a half-state.
    return NextResponse.json(empty)
  }

  // Latest campaign for this issue. There can be more than one row if the
  // author resent (e.g. test then production), so order by created_at desc.
  const { data: campaign } = await supabaseAdmin
    .from('nl_campaigns')
    .select('id, unisender_campaign_id, unisender_message_id, status, total_sent, total_delivered, total_opened, total_clicked, total_unsubscribed, open_rate, click_rate, stats_fetched_at')
    .eq('issue_id', issue.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const payload: ArticleEmailStatus = {
    hasIssue: true,
    issue: {
      id: issue.id,
      issueNumber: issue.issue_number ?? null,
      subject: issue.subject ?? '',
      status: issue.status ?? null,
      scheduledAt: issue.scheduled_at ?? null,
      sentAt: issue.sent_at ?? null,
    },
    campaign: campaign
      ? {
          id: campaign.id,
          unisenderCampaignId: campaign.unisender_campaign_id ?? null,
          unisenderMessageId: campaign.unisender_message_id ?? null,
          status: campaign.status ?? null,
          totalSent: campaign.total_sent ?? null,
          totalDelivered: campaign.total_delivered ?? null,
          totalOpened: campaign.total_opened ?? null,
          totalClicked: campaign.total_clicked ?? null,
          totalUnsubscribed: campaign.total_unsubscribed ?? null,
          openRate: campaign.open_rate != null ? Number(campaign.open_rate) : null,
          clickRate: campaign.click_rate != null ? Number(campaign.click_rate) : null,
          statsFetchedAt: campaign.stats_fetched_at ?? null,
        }
      : null,
  }
  return NextResponse.json(payload)
}
