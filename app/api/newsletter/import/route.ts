// Imports campaign sends from Unisender back into our DB.
//
// Two flows happen here, governed by whether a matching issue already
// exists in nl_issues:
//
//   1. SEND VIA CONTENTOS: the user clicked "В Unisender" → "Запланировать"
//      in our editor. nl_campaigns already has a row with
//      unisender_message_id, but no unisender_campaign_id yet (campaign is
//      created at schedule time). On import we just attach campaign_id and
//      stats to that row — no new issue.
//
//   2. SEND VIA UNISENDER UI (the "copy + send from new editor" flow the
//      user does manually): the original campaign created via API has
//      message_id X; the user copies it in Unisender UI, creating a new
//      message_id Y with the SAME subject, and sends from there. Our
//      campaign row has Y attached but we want to surface stats on the
//      original issue. So we match by subject: if there's an issue with
//      the same subject that has either no campaign or only a "created"
//      campaign with no campaign_id, attach to it.
//
//   3. UNRELATED SEND: subject doesn't match any issue (e.g. a transactional
//      campaign or something sent outside ContentOS). Create a new issue
//      so the campaign isn't lost, matches legacy behaviour.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getCampaigns, getCampaignStats, getMessage } from '@/lib/unisender'
import { getSession } from '@/lib/session'
import { logger } from '@/lib/logger'
import { sanitizeNewsletterHtml } from '@/lib/sanitize'

const log = logger.child({ module: 'newsletter/import' })
const MIN_DATE = '2026-04-13' // Only import campaigns from this date

interface ImportResult {
  imported: number   // new issues created
  linked: number     // existing issues that got a campaign attached
  updated: number    // existing campaigns that had stats refreshed
  total: number
}

async function refreshStats(campaignId: string, unisenderCampaignId: number): Promise<void> {
  try {
    const stats = await getCampaignStats(unisenderCampaignId)
    const openRate = stats.delivered > 0
      ? Math.round((stats.read_unique / stats.delivered) * 10000) / 100
      : 0
    const clickRate = stats.delivered > 0
      ? Math.round((stats.clicked_unique / stats.delivered) * 10000) / 100
      : 0
    await supabaseAdmin
      .from('nl_campaigns')
      .update({
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
      .eq('id', campaignId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.warn({ campaignId, unisenderCampaignId, err: msg }, 'stats fetch failed')
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  // Optional: ?issueId=... or ?subject=... restricts to a single issue.
  // Used by EmailStatusCard's "Обновить статус" button to refresh just
  // one row without scanning the full campaign list.
  const url = new URL(req.url)
  const issueIdFilter = url.searchParams.get('issueId')
  const subjectFilter = url.searchParams.get('subject')

  try {
    const campaigns = await getCampaigns(100)
    const session = await getSession()
    const projectId = session.activeProjectId ?? null
    const result: ImportResult = { imported: 0, linked: 0, updated: 0, total: campaigns.length }

    for (const camp of campaigns) {
      if (camp.status !== 'completed' && camp.status !== 'analysed') continue
      if (camp.start_time < MIN_DATE) continue

      if (subjectFilter && camp.subject.trim() !== subjectFilter.trim()) continue

      // 0. Already imported? Refresh stats and continue.
      const { data: existingByCampaign } = await supabaseAdmin
        .from('nl_campaigns')
        .select('id')
        .eq('unisender_campaign_id', camp.id)
        .maybeSingle()

      if (existingByCampaign) {
        await refreshStats(existingByCampaign.id, camp.id)
        result.updated++
        continue
      }

      // 1. Matching campaign by message_id (we sent this from ContentOS).
      const { data: campaignByMessage } = await supabaseAdmin
        .from('nl_campaigns')
        .select('id, issue_id, unisender_campaign_id')
        .eq('unisender_message_id', camp.message_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (campaignByMessage && !campaignByMessage.unisender_campaign_id) {
        await supabaseAdmin
          .from('nl_campaigns')
          .update({ unisender_campaign_id: camp.id, status: 'sent', updated_at: new Date().toISOString() })
          .eq('id', campaignByMessage.id)
        await refreshStats(campaignByMessage.id, camp.id)
        await supabaseAdmin
          .from('nl_issues')
          .update({ status: 'sent', sent_at: new Date(camp.start_time + 'Z').toISOString() })
          .eq('id', campaignByMessage.issue_id)
        result.updated++
        continue
      }

      // 2. Matching issue by subject (Unisender UI copy-and-send flow).
      // Only attach if the issue doesn't already have a sent campaign —
      // otherwise we'd double-attribute the same issue to two sends.
      const subjectTrimmed = camp.subject?.trim()
      if (subjectTrimmed) {
        const { data: issueBySubject } = await supabaseAdmin
          .from('nl_issues')
          .select('id, status')
          .eq('subject', subjectTrimmed)
          .neq('status', 'sent')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (issueBySubject && (!issueIdFilter || issueIdFilter === issueBySubject.id)) {
          // Reuse an existing campaign row (if any) or create one.
          const { data: existingCampaign } = await supabaseAdmin
            .from('nl_campaigns')
            .select('id')
            .eq('issue_id', issueBySubject.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          let campaignDbId: string
          if (existingCampaign) {
            await supabaseAdmin
              .from('nl_campaigns')
              .update({
                unisender_message_id: camp.message_id,
                unisender_campaign_id: camp.id,
                list_id: camp.list_id,
                status: 'sent',
                updated_at: new Date().toISOString(),
              })
              .eq('id', existingCampaign.id)
            campaignDbId = existingCampaign.id
          } else {
            const { data: ins, error: insErr } = await supabaseAdmin
              .from('nl_campaigns')
              .insert({
                issue_id: issueBySubject.id,
                unisender_message_id: camp.message_id,
                unisender_campaign_id: camp.id,
                list_id: camp.list_id,
                status: 'sent',
              })
              .select('id')
              .single()
            if (insErr || !ins) continue
            campaignDbId = ins.id
          }

          await refreshStats(campaignDbId, camp.id)
          await supabaseAdmin
            .from('nl_issues')
            .update({ status: 'sent', sent_at: new Date(camp.start_time + 'Z').toISOString() })
            .eq('id', issueBySubject.id)
          result.linked++
          continue
        }
      }

      if (issueIdFilter || subjectFilter) {
        // Single-issue mode: skip unrelated campaigns entirely.
        continue
      }

      // 3. No match. Create a new issue (legacy behaviour) so the campaign
      // isn't lost from analytics.
      let bodyHtml = ''
      try {
        const msg = await getMessage(camp.message_id)
        bodyHtml = msg.body ?? ''
      } catch { /* body may not be available */ }

      // Sanitize Unisender-fetched HTML before storing. body_html and
      // article_html are both rendered through dangerouslySetInnerHTML in
      // the admin UI; without this a compromised Unisender response or
      // MITM could plant <script> straight into the DOM.
      const safeBody = sanitizeNewsletterHtml(bodyHtml)
      const { data: issue } = await supabaseAdmin
        .from('nl_issues')
        .insert({
          subject: camp.subject,
          tag: '',
          body_html: safeBody,
          article_html: safeBody,
          status: 'sent',
          sent_at: camp.start_time ? new Date(camp.start_time + 'Z').toISOString() : null,
          issue_number: null,
          project_id: projectId,
        })
        .select('id')
        .single()
      if (!issue) continue

      const { data: ins } = await supabaseAdmin
        .from('nl_campaigns')
        .insert({
          issue_id: issue.id,
          unisender_message_id: camp.message_id,
          unisender_campaign_id: camp.id,
          list_id: camp.list_id,
          status: 'sent',
        })
        .select('id')
        .single()
      if (ins) await refreshStats(ins.id, camp.id)
      result.imported++
    }

    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка импорта'
    log.error({ err: msg }, 'import failed')
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
