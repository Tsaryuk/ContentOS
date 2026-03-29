-- Performance indexes for common query patterns

-- Composite index: videos by channel ordered by date (most common list query)
CREATE INDEX IF NOT EXISTS idx_yt_videos_channel_date
  ON yt_videos (channel_id, published_at DESC);

-- Index for sorting all videos by date
CREATE INDEX IF NOT EXISTS idx_yt_videos_published_at
  ON yt_videos (published_at DESC);

-- Unique constraint for social drafts upsert reliability
ALTER TABLE yt_social_drafts
  DROP CONSTRAINT IF EXISTS yt_social_drafts_video_platform_unique;

ALTER TABLE yt_social_drafts
  ADD CONSTRAINT yt_social_drafts_video_platform_unique
  UNIQUE (video_id, platform);
