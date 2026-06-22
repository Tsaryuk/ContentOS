import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { consumeOauthStateCookie } from '@/lib/oauth-state'
import { encryptSecret } from '@/lib/crypto-secrets'
import { getAdminGroups } from '@/lib/vk/client'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const error = req.nextUrl.searchParams.get('error')
  const state = req.nextUrl.searchParams.get('state')

  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '')
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? req.nextUrl.host
  const origin = `${proto}://${host}`

  if (error) return NextResponse.redirect(`${origin}/settings?oauth_error=${encodeURIComponent(error)}`)
  if (!code) return NextResponse.redirect(`${origin}/settings?oauth_error=no_code`)

  // CSRF guard — verify state matches the cookie set at /api/vk/oauth/start
  {
    const errRes = NextResponse.redirect(`${origin}/settings?oauth_error=state_mismatch`)
    if (!consumeOauthStateCookie(req, errRes, 'vk', state)) return errRes
  }

  const clientId = process.env.VK_CLIENT_ID
  const clientSecret = process.env.VK_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${origin}/settings?oauth_error=vk_not_configured`)
  }
  const redirectUri = `${origin}/api/vk/oauth/callback`

  // Exchange the code for an access token (offline → no expiry)
  const tokenUrl = new URL('https://oauth.vk.com/access_token')
  tokenUrl.searchParams.set('client_id', clientId)
  tokenUrl.searchParams.set('client_secret', clientSecret)
  tokenUrl.searchParams.set('redirect_uri', redirectUri)
  tokenUrl.searchParams.set('code', code)

  const tokenRes = await fetch(tokenUrl.toString())
  const tokens = await tokenRes.json()
  if (tokens.error || !tokens.access_token) {
    const msg = tokens.error_description || tokens.error || 'no_token'
    return NextResponse.redirect(`${origin}/settings?oauth_error=${encodeURIComponent(msg)}`)
  }

  const accessToken: string = tokens.access_token
  const vkUserId: number | null = tokens.user_id ?? null

  // Discover admin communities and upsert a vk_channel per community, all
  // sharing this user token. owner_id of a community video is the negative id.
  let count = 0
  try {
    const groups = await getAdminGroups(accessToken)
    for (const g of groups) {
      await supabaseAdmin.from('vk_channels').upsert(
        {
          vk_owner_id: -Math.abs(g.id),
          name: g.name ?? String(g.id),
          screen_name: g.screen_name ?? null,
          photo_url: g.photo_200 ?? null,
          access_token: encryptSecret(accessToken),
          vk_user_id: vkUserId,
          needs_reauth: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'vk_owner_id' },
      )
      count++
    }
  } catch {
    return NextResponse.redirect(`${origin}/settings?oauth_error=groups_fetch_failed`)
  }

  return NextResponse.redirect(`${origin}/settings?oauth_ok=1&channels=${count}&platform=vk`)
}
