-- 044_schema_sync.sql
-- Фиксация дрейфа схемы: изменения, применённые напрямую через Supabase-консоль
-- (create_article_ideas, add_resurfacing_support, reply_coach_fields,
--  add_project_cta_fields_and_reply_log_attribution, ручная правка status constraint).
-- Идемпотентна: на проде no-op, на свежей БД воспроизводит текущее состояние.

-- 1. yt_videos.status: добавлен статус 'producing' (используется worker handleProduce)
ALTER TABLE yt_videos DROP CONSTRAINT IF EXISTS yt_videos_status_check;
ALTER TABLE yt_videos ADD CONSTRAINT yt_videos_status_check
  CHECK (status IN (
    'pending', 'transcribing', 'producing', 'generating', 'thumbnail',
    'review', 'publishing', 'done', 'error'
  ));

-- 2. projects: CTA-поля для авто-ответов на комментарии
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS cta_url TEXT,
  ADD COLUMN IF NOT EXISTS cta_description TEXT,
  ADD COLUMN IF NOT EXISTS cta_audience_keywords TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS cta_priority INTEGER DEFAULT 0;

-- 3. comment_reply_log: атрибуция CTA + reply coach
ALTER TABLE comment_reply_log
  ADD COLUMN IF NOT EXISTS cta_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_draft TEXT,
  ADD COLUMN IF NOT EXISTS feedback TEXT CHECK (feedback IN ('good', 'bad', 'neutral'));

CREATE INDEX IF NOT EXISTS comment_reply_log_cta_project_id_idx
  ON comment_reply_log(cta_project_id);

CREATE INDEX IF NOT EXISTS comment_reply_log_feedback_idx
  ON comment_reply_log(channel_id, feedback) WHERE feedback IS NOT NULL;

-- 4. nl_article_ideas: банк идей для статей (модуль Ideas)
CREATE TABLE IF NOT EXISTS nl_article_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  raw_thought TEXT NOT NULL,
  ai_titles TEXT[] NOT NULL DEFAULT '{}',
  ai_tags TEXT[] NOT NULL DEFAULT '{}',
  ai_angles TEXT[] NOT NULL DEFAULT '{}',
  similar_to JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'drafted', 'archived')),
  promoted_article_id UUID REFERENCES nl_articles(id) ON DELETE SET NULL,
  source_article_id UUID REFERENCES nl_articles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nl_article_ideas_status_idx
  ON nl_article_ideas(status, created_at DESC);

CREATE INDEX IF NOT EXISTS nl_article_ideas_project_idx
  ON nl_article_ideas(project_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS nl_article_ideas_source_article_id_idx
  ON nl_article_ideas(source_article_id);

-- 5. nl_articles: поддержка resurfacing (повторное предложение старых статей)
ALTER TABLE nl_articles
  ADD COLUMN IF NOT EXISTS resurface_suggested_at TIMESTAMPTZ;

-- RLS на nl_article_ideas / cover_styles / cover_generations / comment_reply_log /
-- yt_transcript_embeddings сейчас отключён (как в проде) — включение по паттерну
-- 040_rls_hardening вынесено в отдельный security-PR.
