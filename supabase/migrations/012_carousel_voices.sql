-- 012_carousel_voices.sql
-- Voice style training for carousels

CREATE TABLE IF NOT EXISTS carousel_voices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  examples TEXT[] NOT NULL,
  voice_prompt TEXT NOT NULL,
  summary TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_carousel_voices_project ON carousel_voices(project_id);

ALTER TABLE carousel_voices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on carousel_voices" ON carousel_voices FOR ALL USING (true);

-- Add voice_id and source_text to carousels
ALTER TABLE carousels ADD COLUMN IF NOT EXISTS voice_id UUID REFERENCES carousel_voices(id) ON DELETE SET NULL;
ALTER TABLE carousels ADD COLUMN IF NOT EXISTS source_text TEXT;
ALTER TABLE carousels ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'text';
