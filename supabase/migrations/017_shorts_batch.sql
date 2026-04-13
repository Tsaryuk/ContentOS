-- 017: Shorts batch editing support
-- Adds guest info, shorts workflow status for bulk editing

ALTER TABLE yt_videos
  ADD COLUMN IF NOT EXISTS guest_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_title TEXT,
  ADD COLUMN IF NOT EXISTS shorts_status TEXT DEFAULT 'pending'
    CHECK (shorts_status IN ('pending', 'generated', 'approved', 'published'));

-- Index for filtering shorts by workflow status
CREATE INDEX IF NOT EXISTS idx_yt_videos_shorts_status
  ON yt_videos(shorts_status)
  WHERE duration_seconds <= 180;
