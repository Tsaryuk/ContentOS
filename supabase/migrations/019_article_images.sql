-- Add cover toggle and track inline images

ALTER TABLE nl_articles
  ADD COLUMN show_cover_in_article BOOLEAN NOT NULL DEFAULT true;

-- Track generated inline images per article for management
CREATE TABLE nl_article_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES nl_articles(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  prompt TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nl_article_images_article ON nl_article_images(article_id);
