-- 021_ai_usage_tracking.sql — cost visibility for paid AI / external API calls
-- Already applied via MCP on 2026-04-17 to the contentos Supabase project.
-- Keep in git for version control.

CREATE TABLE IF NOT EXISTS ai_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      TEXT NOT NULL,      -- 'anthropic' | 'openai' | 'fal' | 'recraft' | 'unisender'
  model         TEXT NOT NULL,      -- 'claude-sonnet-4-5', 'whisper-1', 'fal-ai/nano-banana-2/edit', etc
  task          TEXT,               -- 'transcribe' | 'produce' | 'thumbnail' | 'cover' | 'comments' | ...
  input_tokens  INTEGER,
  output_tokens INTEGER,
  units         INTEGER,            -- 1 per image, 1 per audio-minute, etc
  cost_usd      NUMERIC(10, 6),     -- best-effort USD; null if we don't know
  video_id      UUID REFERENCES yt_videos(id) ON DELETE SET NULL,
  post_id       UUID,               -- polymorphic: tg_posts / nl_issues / articles
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_provider_model ON ai_usage(provider, model);
CREATE INDEX IF NOT EXISTS idx_ai_usage_task ON ai_usage(task);
CREATE INDEX IF NOT EXISTS idx_ai_usage_video ON ai_usage(video_id);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on ai_usage" ON ai_usage FOR ALL USING (true);
