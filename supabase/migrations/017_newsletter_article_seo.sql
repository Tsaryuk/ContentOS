-- Article (extended version for blog) and SEO fields

ALTER TABLE nl_issues
  ADD COLUMN article_html TEXT NOT NULL DEFAULT '',
  ADD COLUMN article_body_json JSONB,
  ADD COLUMN cover_url TEXT,
  ADD COLUMN youtube_url TEXT,
  ADD COLUMN seo_title TEXT NOT NULL DEFAULT '',
  ADD COLUMN seo_description TEXT NOT NULL DEFAULT '',
  ADD COLUMN seo_keywords TEXT[] DEFAULT '{}',
  ADD COLUMN og_image_url TEXT,
  ADD COLUMN blog_published_at TIMESTAMPTZ;
