-- Projects: top-level grouping (e.g. "Денис Царюк", "Медиа Офлайн Клуба")
CREATE TABLE IF NOT EXISTS projects (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  name       TEXT NOT NULL,
  color      TEXT DEFAULT '#a67ff0',
  slug       TEXT UNIQUE,
  is_active  BOOLEAN DEFAULT true
);

-- Google OAuth accounts (one token per Google account, shared across channels)
CREATE TABLE IF NOT EXISTS google_accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  google_id     TEXT UNIQUE NOT NULL,
  email         TEXT NOT NULL,
  name          TEXT,
  picture       TEXT,
  refresh_token TEXT NOT NULL
);

-- Link yt_channels to projects and google accounts
ALTER TABLE yt_channels
  ADD COLUMN IF NOT EXISTS project_id       UUID REFERENCES projects(id),
  ADD COLUMN IF NOT EXISTS google_account_id UUID REFERENCES google_accounts(id),
  ADD COLUMN IF NOT EXISTS thumbnail_url    TEXT;

-- Insert default project
INSERT INTO projects (name, color, slug)
VALUES ('Денис Царюк', '#a67ff0', 'denis-tsaryuk')
ON CONFLICT (slug) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_yt_channels_project ON yt_channels(project_id);
CREATE INDEX IF NOT EXISTS idx_yt_channels_google_account ON yt_channels(google_account_id);
