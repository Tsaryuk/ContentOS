import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { syncSiteAssetsOnly } from '@/lib/articles/publish'

// POST /api/articles/sync-assets
// Pushes shell files (article.php, article.css, index.html, archive.html…)
// from services/letters-site/ to the host without touching any article.
// Triggered by the Upload button in /articles header.
export async function POST(): Promise<NextResponse> {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth

  try {
    const result = await syncSiteAssetsOnly()
    return NextResponse.json({ success: true, ...result })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Ошибка синхронизации'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
