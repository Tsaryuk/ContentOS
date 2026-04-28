// pgvector-backed retrieval over transcript chunks. Used when a video's
// transcript is too long to inline in the comment-reply prompt.

import OpenAI from 'openai'
import { supabaseAdmin } from '@/lib/supabase'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

export const EMBED_MODEL = 'text-embedding-3-small'
export const EMBED_DIMS = 1536
const EMBED_BATCH = 64

// transcript_chunks rows in yt_videos use { start, end, text } shape (legacy);
// some older code paths may have written { start_secs, end_secs, text }.
// Normalise here so RAG doesn't care.
export interface RawTranscriptChunk {
  start?: number
  start_secs?: number
  end?: number
  end_secs?: number
  text: string
}

interface NormalizedChunk {
  start_secs: number | null
  end_secs: number | null
  text: string
}

function normalizeChunk(c: RawTranscriptChunk): NormalizedChunk {
  return {
    start_secs: typeof c.start_secs === 'number' ? c.start_secs : typeof c.start === 'number' ? c.start : null,
    end_secs: typeof c.end_secs === 'number' ? c.end_secs : typeof c.end === 'number' ? c.end : null,
    text: c.text,
  }
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
  })
  return res.data.map((d) => d.embedding)
}

export async function embedTranscript(videoId: string): Promise<{ chunks: number; skipped: boolean }> {
  const { data: video } = await supabaseAdmin
    .from('yt_videos')
    .select('id, transcript_chunks')
    .eq('id', videoId)
    .maybeSingle<{ id: string; transcript_chunks: RawTranscriptChunk[] | null }>()

  if (!video) return { chunks: 0, skipped: true }
  const raw = video.transcript_chunks ?? []
  if (raw.length === 0) return { chunks: 0, skipped: true }

  const chunks = raw.map(normalizeChunk).filter((c) => c.text && c.text.trim().length > 0)
  if (chunks.length === 0) return { chunks: 0, skipped: true }

  // Wipe stale rows first — transcripts can be regenerated, and we want a
  // clean replacement, not a half-old half-new mix.
  await supabaseAdmin.from('yt_transcript_embeddings').delete().eq('video_id', videoId)

  let written = 0
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const slice = chunks.slice(i, i + EMBED_BATCH)
    const vectors = await embedBatch(slice.map((c) => c.text))
    const rows = slice.map((c, j) => ({
      video_id: videoId,
      chunk_index: i + j,
      start_secs: c.start_secs,
      end_secs: c.end_secs,
      text: c.text,
      // pgvector accepts string form like "[0.1,0.2,...]" via REST.
      embedding: '[' + vectors[j].join(',') + ']',
    }))
    const { error } = await supabaseAdmin.from('yt_transcript_embeddings').insert(rows)
    if (error) throw new Error(`Embedding insert failed: ${error.message}`)
    written += slice.length
  }

  return { chunks: written, skipped: false }
}

export interface RagChunk {
  start_secs: number | null
  end_secs: number | null
  text: string
  similarity: number
}

export async function topKChunks(
  videoId: string,
  query: string,
  k = 6,
): Promise<RagChunk[]> {
  if (!query.trim()) return []
  const [embedding] = await embedBatch([query])

  const { data, error } = await supabaseAdmin.rpc('match_transcript_chunks', {
    p_video_id: videoId,
    p_query_embedding: '[' + embedding.join(',') + ']',
    p_match_count: k,
  })
  if (error) {
    console.error('[rag] match_transcript_chunks failed:', error.message)
    return []
  }

  return ((data ?? []) as Array<{
    chunk_index: number
    start_secs: number | null
    end_secs: number | null
    text: string
    similarity: number
  }>).map((row) => ({
    start_secs: row.start_secs,
    end_secs: row.end_secs,
    text: row.text,
    similarity: row.similarity,
  }))
}

// Above this transcript length we switch from "inline everything" to
// pgvector top-k retrieval. Matches the threshold the comment-reply prompt
// uses for its full-text path.
export const RAG_THRESHOLD_CHARS = 8000

export async function pickContextChunks(
  videoId: string,
  transcript: string | null,
  query: string,
  fallbackChunks: Array<{ start?: number | null; end?: number | null; start_secs?: number | null; end_secs?: number | null; text: string }> | null,
  k = 6,
): Promise<{ start_secs: number | null; end_secs: number | null; text: string }[] | null> {
  // Only switch to RAG for long transcripts; short ones already fit fully.
  if (!transcript || transcript.length <= RAG_THRESHOLD_CHARS) return null

  const { count } = await supabaseAdmin
    .from('yt_transcript_embeddings')
    .select('id', { count: 'exact', head: true })
    .eq('video_id', videoId)

  if (!count || count === 0) {
    // No embeddings yet — fall back to whatever the caller already has.
    return fallbackChunks?.map((c) => ({
      start_secs: typeof c.start_secs === 'number' ? c.start_secs : typeof c.start === 'number' ? c.start : null,
      end_secs: typeof c.end_secs === 'number' ? c.end_secs : typeof c.end === 'number' ? c.end : null,
      text: c.text,
    })) ?? null
  }

  const matches = await topKChunks(videoId, query, k)
  if (matches.length === 0) return null
  return matches.map((m) => ({
    start_secs: m.start_secs,
    end_secs: m.end_secs,
    text: m.text,
  }))
}

const BACKFILL_BATCH = 5

export async function backfillMissingEmbeddings(): Promise<{ ok: number; failed: number }> {
  // Priority: podcasts → long-form videos → (shorts skipped entirely — their
  // transcripts always fit inline below the RAG threshold, so embedding them
  // would burn tokens for zero benefit).
  // Within each tier, newest published first because comment volume tracks
  // publish recency. published_at, not updated_at — the latter gets bumped
  // on metadata edits and would shuffle ancient videos to the front whenever
  // a description got touched.
  const fetchByType = (contentType: 'podcast' | 'video') =>
    supabaseAdmin
      .from('yt_videos')
      .select('id')
      .eq('content_type', contentType)
      .not('transcript', 'is', null)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(BACKFILL_BATCH * 2)

  const [{ data: podcasts }, { data: videos }] = await Promise.all([
    fetchByType('podcast'),
    fetchByType('video'),
  ])
  const candidates = [...(podcasts ?? []), ...(videos ?? [])]

  let ok = 0
  let failed = 0
  let processed = 0

  for (const v of candidates ?? []) {
    if (processed >= BACKFILL_BATCH) break
    const { count } = await supabaseAdmin
      .from('yt_transcript_embeddings')
      .select('id', { count: 'exact', head: true })
      .eq('video_id', v.id)
    if ((count ?? 0) > 0) continue

    try {
      await embedTranscript(v.id)
      ok += 1
    } catch (err) {
      failed += 1
      console.error('[rag-backfill] failed', v.id, err instanceof Error ? err.message : err)
    }
    processed += 1
  }
  return { ok, failed }
}
