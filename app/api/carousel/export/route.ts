import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { BRAND_PRESETS } from '@/lib/carousel/types'
import type { CarouselSlide } from '@/lib/carousel/types'

export const maxDuration = 180

// Build self-contained HTML for a single slide
function buildSlideHTML(
  slide: CarouselSlide,
  index: number,
  total: number,
  preset: string,
  illustrationUrl: string | null,
): string {
  const p = BRAND_PRESETS[preset] ?? BRAND_PRESETS.tsaryuk
  const isFirst = index === 0
  const isLast = index === total - 1
  const isDark = !isFirst && !isLast && index % 2 === 0
  const bg = isDark ? p.dark : p.light
  const fg = isDark ? p.light : p.ink
  const fgMuted = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)'
  const divColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
  const progressTrack = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)'
  const progressFill = isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.3)'
  const pct = Math.round(((index + 1) / total) * 100)

  if (isFirst) {
    return `<div style="width:420px;height:525px;background:${bg};display:flex;flex-direction:column;position:relative;overflow:hidden;font-family:'${p.bodyFont}',sans-serif;">
      ${illustrationUrl ? `<div style="position:absolute;inset:0;"><img src="${illustrationUrl}" style="width:100%;height:100%;object-fit:cover;opacity:0.15;" /></div>` : ''}
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:36px 32px;position:relative;z-index:1;">
        <div style="font-family:'${p.bodyFont}',sans-serif;font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:${fgMuted};margin-bottom:14px;">${slide.tag || ''}</div>
        <div style="font-family:'${p.headFont}',sans-serif;font-size:32px;font-weight:900;line-height:0.95;letter-spacing:-1px;color:${fg};margin-bottom:14px;">${slide.title}</div>
        ${slide.subtitle ? `<div style="font-family:'${p.headFont}',sans-serif;font-size:14px;font-weight:300;color:${fgMuted};margin-bottom:16px;">${slide.subtitle}</div>` : ''}
        ${slide.body ? `<div style="font-size:13px;line-height:1.55;color:${fgMuted};max-width:320px;">${slide.body}</div>` : ''}
      </div>
      <div style="position:absolute;bottom:16px;left:32px;right:32px;display:flex;align-items:center;gap:8px;">
        <div style="font-family:'${p.headFont}',sans-serif;font-size:9px;font-weight:600;color:${fgMuted};letter-spacing:1px;">${p.handle}</div>
      </div>
    </div>`
  }

  if (isLast) {
    return `<div style="width:420px;height:525px;background:${bg};display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;font-family:'${p.bodyFont}',sans-serif;">
      <div style="width:64px;height:64px;border-radius:50%;background:${p.ink};display:flex;align-items:center;justify-content:center;font-family:'${p.headFont}',sans-serif;font-size:22px;font-weight:700;color:${p.light};margin-bottom:16px;">${p.avatarLetter}</div>
      <div style="font-family:'${p.headFont}',sans-serif;font-size:24px;font-weight:900;color:${fg};margin-bottom:8px;">${slide.title}</div>
      <div style="font-size:14px;color:${fgMuted};margin-bottom:20px;">${slide.body || 'Сохрани · Поделись · Подпишись'}</div>
      <div style="font-family:'${p.headFont}',sans-serif;font-size:11px;font-weight:600;color:${fgMuted};letter-spacing:1px;">${p.handle}</div>
      <div style="position:absolute;bottom:0;left:0;right:0;padding:12px 26px 16px;display:flex;align-items:center;gap:9px;">
        <div style="flex:1;height:2px;border-radius:2px;background:${progressTrack};"><div style="height:100%;width:100%;border-radius:2px;background:${progressFill};"></div></div>
        <span style="font-size:10px;font-weight:500;color:${fgMuted};">${total}/${total}</span>
      </div>
    </div>`
  }

  // Content slide
  const num = index
  return `<div style="width:420px;height:525px;background:${bg};display:flex;flex-direction:column;padding:30px 28px 40px;position:relative;overflow:hidden;font-family:'${p.bodyFont}',sans-serif;">
    <div style="font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:${fgMuted};margin-bottom:12px;">${slide.tag || ''}</div>
    <div style="font-family:'${p.headFont}',sans-serif;font-size:10px;font-weight:300;letter-spacing:0.5px;color:${fgMuted};margin-bottom:5px;">${num}.</div>
    <div style="font-family:'${p.headFont}',sans-serif;font-size:26px;font-weight:900;line-height:0.95;letter-spacing:-1px;color:${fg};margin-bottom:14px;">${slide.title}</div>
    ${slide.lead ? `<div style="font-size:13px;line-height:1.55;color:${fgMuted};margin-bottom:6px;">${slide.lead}</div>` : ''}
    ${slide.bold ? `<div style="font-size:13px;font-weight:700;line-height:1.55;color:${fg};margin-bottom:10px;">${slide.bold}</div>` : ''}
    <div style="height:1px;background:${divColor};margin:11px 0;"></div>
    <div style="display:flex;gap:16px;margin-bottom:10px;">
      ${slide.label1 ? `<div style="flex:1;"><div style="font-family:'${p.headFont}',sans-serif;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${fgMuted};margin-bottom:4px;">${slide.label1}</div><div style="font-size:12px;line-height:1.5;color:${fg};">${slide.col1 || ''}</div></div>` : ''}
      ${slide.label2 ? `<div style="flex:1;"><div style="font-family:'${p.headFont}',sans-serif;font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${fgMuted};margin-bottom:4px;">${slide.label2}</div><div style="font-size:12px;line-height:1.5;color:${fg};">${slide.col2 || ''}</div></div>` : ''}
    </div>
    ${slide.example ? `<div style="height:1px;background:${divColor};margin:6px 0 10px;"></div><div style="font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${fgMuted};margin-bottom:4px;">ПРИМЕР</div><div style="font-size:12px;line-height:1.5;color:${fg};font-style:italic;">${slide.example}</div>` : ''}
    <div style="position:absolute;bottom:0;left:0;right:0;padding:12px 26px 16px;display:flex;align-items:center;gap:9px;">
      <div style="flex:1;height:2px;border-radius:2px;background:${progressTrack};"><div style="height:100%;width:${pct}%;border-radius:2px;background:${progressFill};"></div></div>
      <span style="font-size:10px;font-weight:500;color:${fgMuted};">${index + 1}/${total}</span>
    </div>
  </div>`
}

function buildFullHTML(slide: CarouselSlide, index: number, total: number, preset: string, illustrationUrl: string | null): string {
  const p = BRAND_PRESETS[preset] ?? BRAND_PRESETS.tsaryuk
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(p.headFont)}:wght@300;400;600;700;900&family=${encodeURIComponent(p.bodyFont)}:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box;}</style>
</head><body>${buildSlideHTML(slide, index, total, preset, illustrationUrl)}</body></html>`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { carouselId } = body

    if (!carouselId) {
      return NextResponse.json({ error: 'carouselId is required' }, { status: 400 })
    }

    const { data: carousel, error: fetchErr } = await supabaseAdmin
      .from('carousels')
      .select('*')
      .eq('id', carouselId)
      .single()

    if (fetchErr || !carousel) {
      return NextResponse.json({ error: 'Carousel not found' }, { status: 404 })
    }

    const slides: CarouselSlide[] = carousel.slides ?? []
    if (slides.length === 0) {
      return NextResponse.json({ error: 'No slides to export' }, { status: 400 })
    }

    // Dynamic import Playwright
    let chromium: any
    try {
      const pw = await import('playwright')
      chromium = pw.chromium
    } catch {
      return NextResponse.json({
        error: 'Playwright not installed. Run: npm install playwright && npx playwright install chromium',
      }, { status: 500 })
    }

    const browser = await chromium.launch({ headless: true })
    const exportUrls: string[] = []

    try {
      const page = await browser.newPage({
        viewport: { width: 420, height: 525 },
        deviceScaleFactor: 2.571, // 420 * 2.571 ≈ 1080
      })

      for (let i = 0; i < slides.length; i++) {
        const html = buildFullHTML(slides[i], i, slides.length, carousel.preset, carousel.illustration_url)
        await page.setContent(html, { waitUntil: 'networkidle' })
        await page.waitForTimeout(1500) // Wait for Google Fonts

        const screenshot = await page.screenshot({
          type: 'png',
          clip: { x: 0, y: 0, width: 420, height: 525 },
        })

        const fileName = `${carouselId}/slide_${String(i + 1).padStart(2, '0')}.png`
        await supabaseAdmin.storage.from('thumbnails').upload(fileName, screenshot, {
          contentType: 'image/png',
          upsert: true,
        })

        const { data: urlData } = supabaseAdmin.storage
          .from('thumbnails')
          .getPublicUrl(fileName)

        exportUrls.push(urlData.publicUrl)
        console.log(`[carousel-export] slide ${i + 1}/${slides.length} exported`)
      }

      await page.close()
    } finally {
      await browser.close()
    }

    // Update carousel
    await supabaseAdmin.from('carousels').update({
      export_urls: exportUrls,
      status: 'exported',
      updated_at: new Date().toISOString(),
    }).eq('id', carouselId)

    return NextResponse.json({
      success: true,
      urls: exportUrls,
      count: exportUrls.length,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[carousel-export]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
