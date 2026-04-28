-- 041_comment_replies.sql
-- AI auto-reply infrastructure: extra columns on yt_comments + reply log table.

ALTER TABLE yt_comments
  ADD COLUMN IF NOT EXISTS ai_reply_model TEXT,
  ADD COLUMN IF NOT EXISTS ai_reply_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_reply_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_reply_yt_id TEXT,
  ADD COLUMN IF NOT EXISTS classification JSONB,
  ADD COLUMN IF NOT EXISTS skip_reason TEXT;

-- Pending-reply hot path: top-level comments awaiting a draft/send.
CREATE INDEX IF NOT EXISTS idx_yt_comments_pending_reply
  ON yt_comments(video_id, status)
  WHERE status = 'new' AND parent_comment_id IS NULL AND skip_reason IS NULL;

-- Lookup: replies to one of our published replies (for thread_depth=1).
CREATE INDEX IF NOT EXISTS idx_yt_comments_parent
  ON yt_comments(parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS comment_reply_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES yt_channels(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES yt_comments(id) ON DELETE CASCADE,
  reply_text TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('auto', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  yt_reply_id TEXT,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reply_log_channel_day
  ON comment_reply_log(channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reply_log_comment
  ON comment_reply_log(comment_id);

ALTER TABLE comment_reply_log DISABLE ROW LEVEL SECURITY;
