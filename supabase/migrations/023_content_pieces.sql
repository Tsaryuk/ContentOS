-- 023_content_pieces.sql — longform multiplication pipeline
-- Already applied via MCP on 2026-04-18. Keep in git for version control.

CREATE TABLE IF NOT EXISTS content_pieces (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id   UUID REFERENCES nl_articles(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('threads', 'video_script', 'telegram', 'newsletter_summary')),
  content      TEXT,                        -- final text (plain / markdown)
  metadata     JSONB,                       -- generation params, candidate list, scores
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published', 'archived')),
  created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_pieces_article ON content_pieces(article_id);
CREATE INDEX IF NOT EXISTS idx_content_pieces_kind_status ON content_pieces(kind, status);

ALTER TABLE content_pieces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on content_pieces" ON content_pieces FOR ALL USING (true);
