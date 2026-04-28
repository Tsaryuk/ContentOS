-- 042_transcript_embeddings.sql
-- pgvector-backed RAG over transcript chunks. Used by the comment-reply
-- engine when a video's transcript is too long to fit in the prompt as-is.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS yt_transcript_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES yt_videos(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  start_secs DOUBLE PRECISION,
  end_secs DOUBLE PRECISION,
  text TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (video_id, chunk_index)
);

-- Per-video lookup is the hot path (we only ever retrieve within one video).
CREATE INDEX IF NOT EXISTS idx_transcript_embeddings_video
  ON yt_transcript_embeddings(video_id);

-- IVFFlat index for cosine search. lists=100 is fine up to ~100k rows;
-- can be tuned later if the table grows. Build it AFTER some data lands
-- in production for best recall (Postgres docs guidance).
CREATE INDEX IF NOT EXISTS idx_transcript_embeddings_cosine
  ON yt_transcript_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

ALTER TABLE yt_transcript_embeddings DISABLE ROW LEVEL SECURITY;

-- Top-k cosine retrieval within a single video. Called from the comment-reply
-- engine when the transcript is too long to inline.
CREATE OR REPLACE FUNCTION match_transcript_chunks(
  p_video_id UUID,
  p_query_embedding vector(1536),
  p_match_count INT DEFAULT 6
)
RETURNS TABLE (
  chunk_index INT,
  start_secs DOUBLE PRECISION,
  end_secs DOUBLE PRECISION,
  text TEXT,
  similarity DOUBLE PRECISION
)
LANGUAGE sql STABLE AS $$
  SELECT
    chunk_index,
    start_secs,
    end_secs,
    text,
    1 - (embedding <=> p_query_embedding) AS similarity
  FROM yt_transcript_embeddings
  WHERE video_id = p_video_id
  ORDER BY embedding <=> p_query_embedding
  LIMIT p_match_count;
$$;
