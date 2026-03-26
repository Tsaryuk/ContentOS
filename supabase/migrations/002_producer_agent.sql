-- 002: Producer Agent schema extensions
-- Adds multi-variant output, social drafts, content type tracking

-- New columns on yt_videos
ALTER TABLE yt_videos
  ADD COLUMN IF NOT EXISTS producer_output JSONB,
  ADD COLUMN IF NOT EXISTS selected_variants JSONB DEFAULT '{"title_index": null, "thumbnail_text_index": null, "clips_selected": [], "shorts_selected": []}',
  ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'podcast',
  ADD COLUMN IF NOT EXISTS parent_video_id UUID REFERENCES yt_videos(id);

-- Index for finding clips/shorts of a podcast
CREATE INDEX IF NOT EXISTS idx_yt_videos_parent ON yt_videos(parent_video_id) WHERE parent_video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_yt_videos_content_type ON yt_videos(content_type);

-- Social media drafts table
CREATE TABLE IF NOT EXISTS yt_social_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  video_id UUID NOT NULL REFERENCES yt_videos(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,       -- telegram | youtube_community | instagram_stories
  content TEXT NOT NULL,
  status TEXT DEFAULT 'draft',  -- draft | edited | posted
  posted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_social_drafts_video ON yt_social_drafts(video_id);
CREATE INDEX IF NOT EXISTS idx_social_drafts_platform ON yt_social_drafts(platform);

-- Enable RLS (permissive for now)
ALTER TABLE yt_social_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on yt_social_drafts" ON yt_social_drafts FOR ALL USING (true) WITH CHECK (true);
