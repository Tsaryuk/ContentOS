-- Telegram integration: accounts, channels, posts
-- Uses MTProto (gramjs) for user-level auth

-- Telegram accounts (MTProto session per user phone)
CREATE TABLE tg_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  session_string TEXT NOT NULL,
  first_name TEXT,
  username TEXT,
  project_id UUID REFERENCES projects(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Telegram channels linked to account
CREATE TABLE tg_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_account_id UUID NOT NULL REFERENCES tg_accounts(id) ON DELETE CASCADE,
  tg_channel_id BIGINT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  username TEXT,
  project_id UUID REFERENCES projects(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Telegram posts (standalone + linked to video)
CREATE TABLE tg_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES tg_channels(id) ON DELETE CASCADE,
  video_id UUID REFERENCES yt_videos(id),
  content TEXT NOT NULL,
  media_urls TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'failed')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  tg_message_id INTEGER,
  error TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_tg_posts_channel ON tg_posts(channel_id);
CREATE INDEX idx_tg_posts_status ON tg_posts(status);
CREATE INDEX idx_tg_posts_scheduled ON tg_posts(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX idx_tg_channels_project ON tg_channels(project_id);
CREATE INDEX idx_tg_accounts_project ON tg_accounts(project_id);
