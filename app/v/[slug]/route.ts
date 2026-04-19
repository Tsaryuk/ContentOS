import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  buildYouTubeAppUrl,
  buildYouTubeIntentUrl,
  detectPlatform,
  isInAppBrowser,
} from '@/lib/short-links'

interface ShortLinkRow {
  id: string
  kind: string
  target_url: string
  video_id: string | null
  clicks: number | null
}

interface VideoRow {
  yt_video_id: string | null
}

function extractYtVideoId(targetUrl: string): string | null {
  try {
    const u = new URL(targetUrl)
    const v = u.searchParams.get('v')
    if (v) return v
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace(/^\/+/, '') || null
    }
  } catch {
    // fall through
  }
  return null
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })
}

function buildDeepLinkHtml(ytVideoId: string, webUrl: string, platform: 'ios' | 'android' | 'other'): string {
  // iOS YouTube app claims vnd.youtube://<id> URL scheme.
  // Android resolves intent:// reliably from any WebView, with a web fallback baked in.
  // Non-mobile clients get the plain web URL.
  const appUrl =
    platform === 'android' ? buildYouTubeIntentUrl(ytVideoId, webUrl) :
    platform === 'ios'     ? buildYouTubeAppUrl(ytVideoId) :
    webUrl

  const safeApp = escapeHtml(appUrl)
  const safeWeb = escapeHtml(webUrl)

  // Strategy:
  //  1. On mount, attempt a JS navigation to the app URL (most in-app WebViews
  //     honor this because the page load is itself a user gesture).
  //  2. Keep a prominent tap target pointing at the same app URL — tap is the
  //     strongest user gesture and bypasses WKWebView restrictions on Telegram iOS.
  //  3. Secondary link for "open in browser" so anyone without the app is not stuck.
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Открываем YouTube…</title>
<meta name="robots" content="noindex" />
<style>
  html,body{height:100%;margin:0;background:#0f0f0f;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}
  .wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:24px;text-align:center;}
  h1{font-size:18px;font-weight:500;margin:0 0 12px}
  p{opacity:.7;font-size:14px;margin:0 0 20px;max-width:320px;line-height:1.5}
  .primary{display:inline-block;padding:14px 24px;border-radius:12px;background:#ff0033;color:#fff;text-decoration:none;font-weight:600;font-size:15px;margin-bottom:12px}
  .secondary{display:inline-block;font-size:13px;color:rgba(255,255,255,.55);text-decoration:none;padding:6px 10px}
</style>
</head>
<body>
<div class="wrap">
  <h1>Открываем YouTube…</h1>
  <p>Если видео не открылось автоматически, нажми кнопку ниже.</p>
  <a id="open-app" class="primary" href="${safeApp}">Открыть в YouTube</a>
  <a id="open-web" class="secondary" href="${safeWeb}">Открыть в браузере</a>
</div>
<script>
  (function(){
    var app = ${JSON.stringify(appUrl)};
    var web = ${JSON.stringify(webUrl)};
    var fired = false;
    function goApp(){
      if (fired) return;
      fired = true;
      try { window.location.href = app } catch (e) {}
    }
    // Try app immediately on mount.
    setTimeout(goApp, 50);
    // If after 2s we are still here (no handoff happened), surface the fallback more obviously.
    setTimeout(function(){
      if (!document.hidden) {
        var btn = document.getElementById('open-web');
        if (btn) btn.style.color = '#fff';
      }
    }, 2000);
  })();
</script>
</body>
</html>`
}

async function bumpClicks(slug: string, current: number): Promise<void> {
  try {
    await supabaseAdmin
      .from('short_links')
      .update({ clicks: current + 1 })
      .eq('slug', slug)
  } catch {
    // swallow — tracking must not break redirect
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse | Response> {
  const { slug } = await params

  const { data: link, error } = await supabaseAdmin
    .from('short_links')
    .select('id, kind, target_url, video_id, clicks')
    .eq('slug', slug)
    .single<ShortLinkRow>()

  if (error || !link) {
    return new NextResponse('Not found', { status: 404 })
  }

  void bumpClicks(slug, link.clicks ?? 0)

  const ua = req.headers.get('user-agent')
  const webUrl = link.target_url

  if (link.kind === 'youtube_video' && isInAppBrowser(ua)) {
    let ytVideoId = extractYtVideoId(webUrl)
    if (!ytVideoId && link.video_id) {
      const { data: video } = await supabaseAdmin
        .from('yt_videos')
        .select('yt_video_id')
        .eq('id', link.video_id)
        .single<VideoRow>()
      ytVideoId = video?.yt_video_id ?? null
    }

    if (ytVideoId) {
      return new Response(buildDeepLinkHtml(ytVideoId, webUrl, detectPlatform(ua)), {
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        },
      })
    }
  }

  return NextResponse.redirect(webUrl, 302)
}
