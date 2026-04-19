-- 026_podcasts.sql — podcast shows + episodes, powering an iTunes-compliant
-- RSS feed per show. Mave.digital reads the feed and redistributes to Apple
-- Podcasts / Yandex Music / VK / Zvuk / Castbox / Spotify / Google.
--
-- Shape:
--   podcast_shows     — one row per YouTube channel (1:1). Metadata that's
--                       stable across episodes: title, description, author,
--                       cover art (square 3000x3000 per Apple spec), language,
--                       category, trim defaults, cover-prompt style.
--   podcast_episodes  — one row per published episode. Usually linked to a
--                       yt_videos row (auto-pub from content_type='podcast'),
--                       can also be standalone (manually added mp3 later).

CREATE TABLE IF NOT EXISTS podcast_shows (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id              UUID REFERENCES yt_channels(id) ON DELETE SET NULL,
  slug                    TEXT NOT NULL UNIQUE,
  title                   TEXT NOT NULL,
  description             TEXT,
  author                  TEXT,
  owner_email             TEXT,
  owner_name              TEXT,
  language                TEXT NOT NULL DEFAULT 'ru',
  category                TEXT,                -- iTunes category, e.g. 'Society & Culture'
  subcategory             TEXT,                -- iTunes sub-category
  cover_url               TEXT,                -- square 3000x3000, JPG/PNG, sRGB
  cover_style_prompt      TEXT,                -- passed into ThumbnailStudio for per-episode square covers
  explicit                BOOLEAN NOT NULL DEFAULT false,
  default_trim_start_sec  INT NOT NULL DEFAULT 0,
  default_trim_end_sec    INT NOT NULL DEFAULT 0,
  auto_publish            BOOLEAN NOT NULL DEFAULT true,
                          -- when true, cron picks up content_type='podcast' videos
                          -- that reach status='done' and publishes them.
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_shows_channel
  ON podcast_shows(channel_id) WHERE channel_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS podcast_episodes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id         UUID NOT NULL REFERENCES podcast_shows(id) ON DELETE CASCADE,
  video_id        UUID REFERENCES yt_videos(id) ON DELETE SET NULL,
  episode_number  INT,
  season          INT,
  title           TEXT NOT NULL,
  description     TEXT,
  cover_url       TEXT,                        -- override; NULL means inherit podcast_shows.cover_url
  guest_name      TEXT,                        -- human-readable, e.g. "Василий Якеменко"
  guest_surname   TEXT,                        -- uppercase surname used on the square cover
  audio_url       TEXT NOT NULL,               -- public Supabase Storage URL
  audio_size      BIGINT,                      -- bytes, for <enclosure length>
  audio_mime      TEXT NOT NULL DEFAULT 'audio/mpeg',
  duration_sec    INT,
  published_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','unlisted')),
  trim_start_sec  INT NOT NULL DEFAULT 0,
  trim_end_sec    INT NOT NULL DEFAULT 0,
  explicit        BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One episode per source video: prevents the auto-publish cron from double-
-- inserting. Manual standalone episodes (video_id NULL) are not affected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_podcast_episodes_video
  ON podcast_episodes(video_id) WHERE video_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_podcast_episodes_show_published
  ON podcast_episodes(show_id, published_at DESC);

ALTER TABLE podcast_shows    ENABLE ROW LEVEL SECURITY;
ALTER TABLE podcast_episodes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on podcast_shows"    ON podcast_shows    FOR ALL USING (true);
CREATE POLICY "Allow all on podcast_episodes" ON podcast_episodes FOR ALL USING (true);

-- Seed: one show per existing YouTube channel, slug derived from the channel
-- title (falls back to yt_channel_id if the title sanitizes to empty). Fields
-- like cover_url and description are left NULL so the admin can fill them in
-- /settings → Подкасты before the first auto-publish fires.
INSERT INTO podcast_shows (channel_id, slug, title, author, is_active, auto_publish)
SELECT
  c.id,
  CASE
    WHEN lower(regexp_replace(c.title, '[^[:alnum:]]+', '-', 'g')) IS NULL
      OR lower(regexp_replace(c.title, '[^[:alnum:]]+', '-', 'g')) = '-'
      OR lower(regexp_replace(c.title, '[^[:alnum:]]+', '-', 'g')) = ''
    THEN c.yt_channel_id
    ELSE trim(both '-' from lower(regexp_replace(c.title, '[^[:alnum:]]+', '-', 'g')))
  END,
  c.title,
  c.title,
  true,
  false          -- auto_publish off until the admin fills in cover + description
FROM yt_channels c
WHERE NOT EXISTS (
  SELECT 1 FROM podcast_shows s WHERE s.channel_id = c.id
);
