-- YouTube comments table
CREATE TABLE IF NOT EXISTS yt_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID REFERENCES yt_videos(id) ON DELETE CASCADE,
  yt_comment_id TEXT UNIQUE NOT NULL,
  parent_comment_id TEXT,
  author_name TEXT NOT NULL,
  author_channel_id TEXT,
  author_avatar TEXT,
  text TEXT NOT NULL,
  like_count INT DEFAULT 0,
  reply_count INT DEFAULT 0,
  published_at TIMESTAMPTZ,
  is_owner_reply BOOLEAN DEFAULT false,
  sentiment TEXT,
  ai_reply_draft TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'replied', 'hidden')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_yt_comments_video ON yt_comments(video_id);
CREATE INDEX IF NOT EXISTS idx_yt_comments_status ON yt_comments(status);
CREATE INDEX IF NOT EXISTS idx_yt_comments_published ON yt_comments(published_at DESC);

-- Disable RLS (same as other tables)
ALTER TABLE yt_comments DISABLE ROW LEVEL SECURITY;
