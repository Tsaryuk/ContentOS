-- Add privacy_status to yt_videos for unlisted video support
ALTER TABLE yt_videos
  ADD COLUMN IF NOT EXISTS privacy_status TEXT DEFAULT 'public';

CREATE INDEX IF NOT EXISTS idx_yt_videos_privacy ON yt_videos(privacy_status);
