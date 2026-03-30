-- 010_carousels.sql
-- Carousel production module

CREATE TABLE IF NOT EXISTS carousels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  channel_id UUID REFERENCES yt_channels(id) ON DELETE SET NULL,
  video_id UUID REFERENCES yt_videos(id) ON DELETE SET NULL,

  -- Input
  topic TEXT NOT NULL,
  audience TEXT,
  tone TEXT DEFAULT 'экспертный',
  preset TEXT DEFAULT 'tsaryuk',
  slide_count INT DEFAULT 10,

  -- Generated output
  slides JSONB,
  caption TEXT,
  hashtags TEXT,
  illustration_prompt TEXT,
  illustration_url TEXT,

  -- Export
  export_urls TEXT[],
  export_zip_url TEXT,

  -- Meta
  status TEXT DEFAULT 'draft',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_carousels_project ON carousels(project_id);
CREATE INDEX idx_carousels_video ON carousels(video_id);
CREATE INDEX idx_carousels_status ON carousels(status);

ALTER TABLE carousels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on carousels" ON carousels FOR ALL USING (true);
