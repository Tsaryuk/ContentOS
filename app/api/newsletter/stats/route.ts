import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getCampaignStats, getContactCount } from '@/lib/unisender'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const campaignId = req.nextUrl.searchParams.get('campaign_id')

    // If specific campaign requested, fetch fresh stats
    if (campaignId) {
      const stats = await getCampaignStats(parseInt(campaignId, 10))

      // Update local cache
      const openRate = stats.delivered > 0
        ? Math.round((stats.read_unique / stats.delivered) * 10000) / 100
        : 0
      const clickRate = stats.delivered > 0
        ? Math.round((stats.clicked_unique / stats.delivered) * 10000) / 100
        : 0

      await supabaseAdmin
        .from('nl_campaigns')
        .update({
          total_sent: stats.sent,
          total_delivered: stats.delivered,
          total_opened: stats.read_unique,
          total_clicked: stats.clicked_unique,
          total_unsubscribed: stats.unsubscribed,
          open_rate: openRate,
          click_rate: clickRate,
          raw_stats: stats,
          stats_fetched_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('unisender_campaign_id', parseInt(campaignId, 10))

      return NextResponse.json({ stats, open_rate: openRate, click_rate: clickRate })
    }

    // Dashboard overview
    const subscriberCount = await getContactCount()

    const { data: campaigns } = await supabaseAdmin
      .from('nl_campaigns')
      .select('*, issue:nl_issues(subject, issue_number, sent_at)')
      .eq('status', 'sent')
      .order('created_at', { ascending: false })
      .limit(10)

    return NextResponse.json({
      subscriber_count: subscriberCount,
      campaigns: campaigns ?? [],
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка статистики'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
