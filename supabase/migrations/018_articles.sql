-- Articles as primary content entity (article-first model)
-- Email, YouTube scripts, carousels, threads are derived from articles

CREATE TABLE nl_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  youtube_url TEXT,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  published_at TIMESTAMPTZ,
  -- SEO
  seo_title TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  seo_keywords TEXT[] DEFAULT '{}',
  blog_slug TEXT,
  og_image_url TEXT,
  -- Derived content references
  email_issue_id UUID REFERENCES nl_issues(id),
  -- Meta
  version INTEGER NOT NULL DEFAULT 1,
  project_id UUID REFERENCES projects(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AI chat for articles
CREATE TABLE nl_article_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES nl_articles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nl_articles_status ON nl_articles(status);
CREATE INDEX idx_nl_articles_project ON nl_articles(project_id);
CREATE INDEX idx_nl_articles_slug ON nl_articles(blog_slug);
CREATE INDEX idx_nl_articles_category ON nl_articles(category);
CREATE INDEX idx_nl_article_messages_article ON nl_article_messages(article_id);
