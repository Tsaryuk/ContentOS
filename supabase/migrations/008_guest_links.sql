-- Add guest_links field to yt_videos for per-video guest links in description
ALTER TABLE yt_videos ADD COLUMN IF NOT EXISTS guest_links TEXT;
