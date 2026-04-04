import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getSession } from '@/lib/session'
import { Api } from 'telegram'
import { getPendingAuth, removePendingAuth } from '@/lib/telegram/auth-store'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const { phone, code, phoneCodeHash, password } = await req.json()

    if (!phone || !code || !phoneCodeHash) {
      return NextResponse.json(
        { error: 'Требуются phone, code и phoneCodeHash' },
        { status: 400 }
      )
    }

    const client = getPendingAuth(phone)
    if (!client) {
      return NextResponse.json(
        { error: 'Сессия авторизации истекла. Запросите код повторно.' },
        { status: 410 }
      )
    }

    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: phone,
          phoneCodeHash,
          phoneCode: code,
        })
      )
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes('SESSION_PASSWORD_NEEDED')) {
        if (!password) {
          return NextResponse.json(
            { error: '2FA_REQUIRED', needs2FA: true },
            { status: 200 }
          )
        }

        const passwordResult = await client.invoke(new Api.account.GetPassword())
        await client.invoke(
          new Api.auth.CheckPassword({
            password: await (client as any)._computeCheck(passwordResult, password),
          })
        )
      } else {
        throw err
      }
    }

    // Auth successful — save session
    const sessionString = (client.session as any).save() as string

    const me = await client.getMe()
    const firstName = (me as any).firstName ?? null
    const username = (me as any).username ?? null

    const session = await getSession()
    const projectId = session.activeProjectId ?? null

    // Upsert account
    const { data: account, error: accError } = await supabaseAdmin
      .from('tg_accounts')
      .upsert(
        {
          phone,
          session_string: sessionString,
          first_name: firstName,
          username,
          project_id: projectId,
        },
        { onConflict: 'phone' }
      )
      .select()
      .single()

    if (accError || !account) {
      return NextResponse.json(
        { error: accError?.message ?? 'Ошибка сохранения аккаунта' },
        { status: 500 }
      )
    }

    // Fetch user's channels where they are admin
    const dialogs = await client.getDialogs({ limit: 100 })
    const adminChannels = dialogs.filter(d => {
      const entity = d.entity as any
      return (
        entity?.className === 'Channel' &&
        (entity.creator || entity.adminRights)
      )
    })

    for (const dialog of adminChannels) {
      const entity = dialog.entity as any
      await supabaseAdmin.from('tg_channels').upsert(
        {
          tg_account_id: account.id,
          tg_channel_id: Number(entity.id),
          title: entity.title ?? 'Unknown',
          username: entity.username ?? null,
          project_id: projectId,
        },
        { onConflict: 'tg_channel_id' }
      )
    }

    removePendingAuth(phone)

    return NextResponse.json({
      success: true,
      account: {
        id: account.id,
        phone: account.phone,
        first_name: firstName,
        username,
      },
      channelsCount: adminChannels.length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Ошибка верификации'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
