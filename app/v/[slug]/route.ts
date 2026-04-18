import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  buildYouTubeAppUrl,
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

function buildDeepLinkHtml(ytVideoId: string, webUrl: string): string {
  const appUrl = buildYouTubeAppUrl(ytVideoId)
  const safeHref = escapeHtml(webUrl)
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
  p{opacity:.7;font-size:14px;margin:0 0 24px;max-width:320px;line-height:1.5}
  a{display:inline-block;padding:12px 20px;border-radius:10px;background:#fff;color:#0f0f0f;text-decoration:none;font-weight:600;font-size:15px}
</style>
</head>
<body>
<div class="wrap">
  <h1>Открываем YouTube…</h1>
  <p>Если видео не открылось в приложении, нажми кнопку ниже.</p>
  <a id="fallback" href="${safeHref}">Открыть в браузере</a>
</div>
<script>
  (function(){
    var app = ${JSON.stringify(appUrl)};
    var web = ${JSON.stringify(webUrl)};
    var t = Date.now();
    window.location.href = app;
    setTimeout(function(){
      if (Date.now() - t < 2500 && !document.hidden) {
        window.location.href = web;
      }
    }, 1200);
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
      return new Response(buildDeepLinkHtml(ytVideoId, webUrl), {
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
