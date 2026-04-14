-- Content Ideas Agent — initial schema
-- Изолированная Postgres-схема, чтобы не пересекаться с основными таблицами contentos.

CREATE SCHEMA IF NOT EXISTS content_ideas;

SET search_path TO content_ideas, public;

-- ============================================================
-- sources
-- ============================================================
CREATE TABLE IF NOT EXISTS content_ideas.sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('youtube', 'email', 'telegram', 'web')),
  identifier TEXT NOT NULL,
  name TEXT NOT NULL,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}'::jsonb,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(type, identifier)
);

CREATE INDEX IF NOT EXISTS idx_cia_sources_type ON content_ideas.sources(type);
CREATE INDEX IF NOT EXISTS idx_cia_sources_active ON content_ideas.sources(is_active) WHERE is_active = true;

-- ============================================================
-- raw_content
-- ============================================================
CREATE TABLE IF NOT EXISTS content_ideas.raw_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES content_ideas.sources(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL,
  url TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  is_processed BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb,
  content_hash TEXT NOT NULL,
  UNIQUE(source_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_cia_raw_content_source ON content_ideas.raw_content(source_id);
CREATE INDEX IF NOT EXISTS idx_cia_raw_content_processed ON content_ideas.raw_content(is_processed) WHERE is_processed = false;
CREATE INDEX IF NOT EXISTS idx_cia_raw_content_published ON content_ideas.raw_content(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_cia_raw_content_hash ON content_ideas.raw_content(content_hash);

-- ============================================================
-- topics
-- ============================================================
CREATE TABLE IF NOT EXISTS content_ideas.topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_content_id UUID NOT NULL REFERENCES content_ideas.raw_content(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  keywords TEXT[] DEFAULT '{}',
  relevance_note TEXT,
  score INT CHECK (score >= 0 AND score <= 100),
  category TEXT CHECK (category IN ('strategy', 'philosophy', 'wellbeing', 'fatherhood', 'business', 'other')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cia_topics_content ON content_ideas.topics(raw_content_id);
CREATE INDEX IF NOT EXISTS idx_cia_topics_score ON content_ideas.topics(score DESC) WHERE score >= 60;
CREATE INDEX IF NOT EXISTS idx_cia_topics_category ON content_ideas.topics(category);
CREATE INDEX IF NOT EXISTS idx_cia_topics_unscored ON content_ideas.topics(id) WHERE score IS NULL;

-- ============================================================
-- content_ideas
-- ============================================================
CREATE TABLE IF NOT EXISTS content_ideas.content_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES content_ideas.topics(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('telegram', 'youtube', 'podcast', 'email', 'reels')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'scheduled', 'published', 'archived')),
  score INT,
  generated_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('russian', coalesce(title, '') || ' ' || coalesce(body, ''))
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_cia_ideas_topic ON content_ideas.content_ideas(topic_id);
CREATE INDEX IF NOT EXISTS idx_cia_ideas_status ON content_ideas.content_ideas(status);
CREATE INDEX IF NOT EXISTS idx_cia_ideas_type ON content_ideas.content_ideas(content_type);
CREATE INDEX IF NOT EXISTS idx_cia_ideas_score ON content_ideas.content_ideas(score DESC);
CREATE INDEX IF NOT EXISTS idx_cia_ideas_search ON content_ideas.content_ideas USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_cia_ideas_generated ON content_ideas.content_ideas(generated_at DESC);

-- ============================================================
-- generation_log
-- ============================================================
CREATE TABLE IF NOT EXISTS content_ideas.generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('monitor', 'extract', 'score', 'generate', 'notify', 'save')),
  sources_count INT,
  items_processed INT,
  items_generated INT,
  success BOOLEAN DEFAULT true,
  errors JSONB,
  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cia_genlog_run ON content_ideas.generation_log(run_id);
CREATE INDEX IF NOT EXISTS idx_cia_genlog_created ON content_ideas.generation_log(created_at DESC);

-- ============================================================
-- Helper: full-text search
-- ============================================================
CREATE OR REPLACE FUNCTION content_ideas.search_ideas(query TEXT, limit_count INT DEFAULT 20)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content_type TEXT,
  score INT,
  rank REAL
)
LANGUAGE SQL
STABLE
SET search_path = ''
AS $$
  SELECT
    ci.id,
    ci.title,
    ci.content_type,
    ci.score,
    ts_rank(ci.search_vector, websearch_to_tsquery('russian', query)) AS rank
  FROM content_ideas.content_ideas ci
  WHERE ci.search_vector @@ websearch_to_tsquery('russian', query)
  ORDER BY rank DESC, ci.score DESC NULLS LAST
  LIMIT limit_count;
$$;

-- ============================================================
-- Expose schema to PostgREST (Supabase API)
-- ============================================================
GRANT USAGE ON SCHEMA content_ideas TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA content_ideas TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA content_ideas TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA content_ideas TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA content_ideas
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA content_ideas
  GRANT ALL ON SEQUENCES TO service_role;
