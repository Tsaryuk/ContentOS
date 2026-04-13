import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getCampaigns, getCampaignStats } from '@/lib/unisender'
import { getSession } from '@/lib/session'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const campaigns = await getCampaigns(50)
    const session = await getSession()
    const projectId = session.activeProjectId ?? null

    let imported = 0

    for (const camp of campaigns) {
      if (camp.status !== 'completed') continue

      // Check if already imported
      const { data: existing } = await supabaseAdmin
        .from('nl_campaigns')
        .select('id')
        .eq('unisender_campaign_id', camp.id)
        .single()

      if (existing) continue

      // Create issue
      const issueNumber = imported + 1
      const { data: issue } = await supabaseAdmin
        .from('nl_issues')
        .insert({
          subject: camp.subject,
          tag: 'Импорт',
          status: 'sent',
          sent_at: camp.start_time ? new Date(camp.start_time + 'Z').toISOString() : null,
          issue_number: null,
          project_id: projectId,
        })
        .select('id')
        .single()

      if (!issue) continue

      // Fetch stats
      let stats: any = {}
      let openRate = 0
      let clickRate = 0
      try {
        stats = await getCampaignStats(camp.id)
        openRate = stats.delivered > 0
          ? Math.round((stats.read_unique / stats.delivered) * 10000) / 100
          : 0
        clickRate = stats.delivered > 0
          ? Math.round((stats.clicked_unique / stats.delivered) * 10000) / 100
          : 0
      } catch { /* some old campaigns may not have stats */ }

      // Create campaign record
      await supabaseAdmin
        .from('nl_campaigns')
        .insert({
          issue_id: issue.id,
          unisender_message_id: camp.message_id,
          unisender_campaign_id: camp.id,
          list_id: camp.list_id,
          status: 'sent',
          total_sent: stats.sent ?? 0,
          total_delivered: stats.delivered ?? 0,
          total_opened: stats.read_unique ?? 0,
          total_clicked: stats.clicked_unique ?? 0,
          total_unsubscribed: stats.unsubscribed ?? 0,
          open_rate: openRate,
          click_rate: clickRate,
          raw_stats: stats,
          stats_fetched_at: new Date().toISOString(),
        })

      imported++
    }

    return NextResponse.json({ imported, total: campaigns.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка импорта'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
