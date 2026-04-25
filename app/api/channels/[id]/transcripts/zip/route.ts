import { NextRequest, NextResponse } from 'next/server'
import JSZip from 'jszip'
import { requireAdmin } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

export const maxDuration = 300

const RESERVED_FS_CHARS = new Set<string>([
  String.fromCharCode(0x5c),
  String.fromCharCode(0x2f),
  String.fromCharCode(0x3a),
  String.fromCharCode(0x2a),
  String.fromCharCode(0x3f),
  String.fromCharCode(0x22),
  String.fromCharCode(0x3c),
  String.fromCharCode(0x3e),
  String.fromCharCode(0x7c),
])

function safeFileName(s: string | null | undefined): string {
  const input = s ?? ''
  let out = ''
  for (const ch of input) {
    const code = ch.charCodeAt(0)
    if (RESERVED_FS_CHARS.has(ch) || code < 0x20) {
      out += '_'
    } else {
      out += ch
    }
  }
  const collapsed = out.split(/\s+/).filter(Boolean).join(' ')
  const noDots = collapsed.replace(/^\.+/, '')
  const capped = noDots.slice(0, 180)
  return capped || 'untitled'
}

interface VideoRow {
  current_title: string | null
  transcript: string | null
  published_at: string | null
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const channelId = params.id

  const { data: channel, error: chErr } = await supabaseAdmin
    .from('yt_channels')
    .select('id, title')
    .eq('id', channelId)
    .single()

  if (chErr || !channel) {
    return NextResponse.json({ error: 'channel not found' }, { status: 404 })
  }

  const { data: videos, error: vErr } = await supabaseAdmin
    .from('yt_videos')
    .select('current_title, transcript, published_at')
    .eq('channel_id', channelId)
    .not('transcript', 'is', null)
    .order('published_at', { ascending: true })

  if (vErr) {
    return NextResponse.json({ error: vErr.message }, { status: 500 })
  }

  const filtered = ((videos ?? []) as VideoRow[]).filter(
    v => typeof v.transcript === 'string' && v.transcript.trim().length > 0,
  )

  if (filtered.length === 0) {
    return NextResponse.json({ error: 'no transcripts found for this channel' }, { status: 404 })
  }

  const zip = new JSZip()
  const usedNames = new Map<string, number>()

  for (const v of filtered) {
    const base = safeFileName(v.current_title)
    const seen = usedNames.get(base) ?? 0
    usedNames.set(base, seen + 1)
    const finalName = seen === 0 ? base : `${base}_${seen + 1}`
    zip.file(`${finalName}.txt`, v.transcript ?? '')
  }

  const buffer = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  const channelSlug = safeFileName(channel.title)
  const datestamp = new Date().toISOString().slice(0, 10)
  const asciiName = `transcripts_${datestamp}.zip`
  const utf8Name = encodeURIComponent(`transcripts_${channelSlug}_${datestamp}.zip`)

  // Copy into a plain ArrayBuffer — Blob's BlobPart type rejects
  // Uint8Array<ArrayBufferLike> from jszip even though it works at runtime.
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer
  const body = new Blob([ab], { type: 'application/zip' })
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
      'Content-Length': String(buffer.byteLength),
      'Cache-Control': 'no-store',
    },
  })
}
