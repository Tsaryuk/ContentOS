import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { createCampaign } from '@/lib/unisender'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  const { id } = await params

  try {
    const body = await req.json()
    const startTime: string | undefined = body.start_time // "YYYY-MM-DD HH:MM" UTC

    const { data: campaign, error } = await supabaseAdmin
      .from('nl_campaigns')
      .select('*')
      .eq('issue_id', id)
      .single()

    if (error || !campaign) {
      return NextResponse.json(
        { error: 'Сначала загрузите письмо в Unisender' },
        { status: 400 }
      )
    }

    if (!campaign.unisender_message_id) {
      return NextResponse.json(
        { error: 'Письмо не загружено в Unisender' },
        { status: 400 }
      )
    }

    const result = await createCampaign({
      messageId: campaign.unisender_message_id,
      startTime,
    })

    await supabaseAdmin
      .from('nl_campaigns')
      .update({
        unisender_campaign_id: result.campaignId,
        status: 'scheduled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)

    await supabaseAdmin
      .from('nl_issues')
      .update({
        status: 'scheduled',
        scheduled_at: startTime ? new Date(startTime + ':00Z').toISOString() : new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    return NextResponse.json({
      campaign_id: result.campaignId,
      status: result.status,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Ошибка планирования'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
