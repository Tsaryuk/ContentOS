-- ClipOS Phase 1: clip candidates and processing jobs

CREATE TABLE IF NOT EXISTS clip_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id UUID NOT NULL REFERENCES yt_videos(id) ON DELETE CASCADE,
  start_time NUMERIC NOT NULL,
  end_time NUMERIC NOT NULL,
  duration NUMERIC GENERATED ALWAYS AS (end_time - start_time) STORED,
  clip_type VARCHAR(20) DEFAULT 'short' CHECK (clip_type IN ('short', 'mini_episode')),
  pattern_type VARCHAR(50),
  scores JSONB NOT NULL DEFAULT '{}',
  hook_phrase TEXT,
  one_sentence_value TEXT,
  suggested_titles JSONB DEFAULT '[]',
  suggested_thumbnail_text JSONB DEFAULT '[]',
  transcript_excerpt TEXT,
  context_notes TEXT,
  status VARCHAR(20) DEFAULT 'candidate'
    CHECK (status IN ('candidate', 'approved', 'rejected', 'processing', 'done', 'failed')),
  approved_title TEXT,
  target_platforms JSONB DEFAULT '["youtube_shorts"]',
  aspect_ratio VARCHAR(10) DEFAULT '9:16',
  output_url TEXT,
  output_path TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_clip_candidates_video ON clip_candidates(video_id);
CREATE INDEX idx_clip_candidates_status ON clip_candidates(status);
CREATE INDEX idx_clip_candidates_score ON clip_candidates((scores->>'virality_potential') DESC);
