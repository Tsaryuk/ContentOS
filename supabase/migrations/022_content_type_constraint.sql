-- 022_content_type_constraint.sql — constrain yt_videos.content_type values
-- Already applied via MCP on 2026-04-17 to the contentos Supabase project.
-- Keep in git for version control.

UPDATE yt_videos
SET content_type = CASE
  WHEN duration_seconds IS NULL THEN COALESCE(content_type, 'podcast')
  WHEN duration_seconds <= 60 THEN 'short'
  WHEN duration_seconds <= 3000 THEN 'video'        -- up to 50 min
  ELSE 'podcast'
END
WHERE content_type IS NULL OR content_type NOT IN ('podcast', 'video', 'short');

ALTER TABLE yt_videos
  DROP CONSTRAINT IF EXISTS yt_videos_content_type_check;

ALTER TABLE yt_videos
  ADD CONSTRAINT yt_videos_content_type_check
  CHECK (content_type IN ('podcast', 'video', 'short'));
