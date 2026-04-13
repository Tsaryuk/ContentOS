-- Newsletter module: issues (выпуски) and campaigns (Unisender)
-- Full cycle: draft → edit → upload to Unisender → schedule → sent → stats

-- Newsletter issues (выпуски рассылки)
CREATE TABLE nl_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_number INTEGER,
  subject TEXT NOT NULL DEFAULT '',
  preheader TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  body_json JSONB,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'uploaded', 'scheduled', 'sent')),
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  blog_slug TEXT,
  blog_published BOOLEAN NOT NULL DEFAULT false,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  versions_history JSONB DEFAULT '[]',
  project_id UUID REFERENCES projects(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unisender campaign data (linked to issue)
CREATE TABLE nl_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES nl_issues(id) ON DELETE CASCADE,
  unisender_message_id INTEGER,
  unisender_campaign_id INTEGER,
  list_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'created', 'scheduled', 'sent', 'error')),
  stats_fetched_at TIMESTAMPTZ,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_opened INTEGER DEFAULT 0,
  total_clicked INTEGER DEFAULT 0,
  total_unsubscribed INTEGER DEFAULT 0,
  open_rate NUMERIC(5,2) DEFAULT 0,
  click_rate NUMERIC(5,2) DEFAULT 0,
  error TEXT,
  raw_stats JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI chat history per issue
CREATE TABLE nl_ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id UUID NOT NULL REFERENCES nl_issues(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_nl_issues_status ON nl_issues(status);
CREATE INDEX idx_nl_issues_project ON nl_issues(project_id);
CREATE INDEX idx_nl_issues_number ON nl_issues(issue_number);
CREATE INDEX idx_nl_campaigns_issue ON nl_campaigns(issue_id);
CREATE INDEX idx_nl_campaigns_status ON nl_campaigns(status);
CREATE INDEX idx_nl_ai_messages_issue ON nl_ai_messages(issue_id);
