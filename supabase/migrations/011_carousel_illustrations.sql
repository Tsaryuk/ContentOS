-- 011_carousel_illustrations.sql
-- Per-slide illustrations and style palette

ALTER TABLE carousels ADD COLUMN IF NOT EXISTS illustration_urls JSONB;
ALTER TABLE carousels ADD COLUMN IF NOT EXISTS style JSONB;
