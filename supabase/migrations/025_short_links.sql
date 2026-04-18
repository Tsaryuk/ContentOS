-- 025_short_links.sql — deep link / short URL table for YouTube videos
-- Route /v/<slug> sniffs UA and redirects to native YT app on in-app browsers.

CREATE TABLE IF NOT EXISTS short_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  kind        TEXT NOT NULL CHECK (kind IN ('youtube_video')),
  video_id    UUID REFERENCES yt_videos(id) ON DELETE CASCADE,
  target_url  TEXT NOT NULL,
  clicks      INT NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_short_links_video ON short_links(video_id);

ALTER TABLE short_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on short_links" ON short_links FOR ALL USING (true);
