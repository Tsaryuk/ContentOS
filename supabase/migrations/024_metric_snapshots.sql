-- 024_metric_snapshots.sql — daily metric snapshots for growth tracking
-- Already applied via MCP on 2026-04-18; keep in git for history.

CREATE TABLE IF NOT EXISTS metric_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  captured_at   DATE NOT NULL,
  source        TEXT NOT NULL CHECK (source IN ('yt_channel', 'unisender', 'tg_channel', 'tiktok', 'instagram')),
  entity_id     TEXT NOT NULL,
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
  subscribers   BIGINT,
  views         BIGINT,
  likes         BIGINT,
  videos        INTEGER,
  raw           JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_metric_snapshot_day_entity
  ON metric_snapshots(captured_at, source, entity_id);
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_project
  ON metric_snapshots(project_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_metric_snapshots_entity_time
  ON metric_snapshots(source, entity_id, captured_at DESC);

ALTER TABLE metric_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on metric_snapshots" ON metric_snapshots FOR ALL USING (true);

-- Today's snapshot backfill so growth calculations can start immediately.
INSERT INTO metric_snapshots (captured_at, source, entity_id, project_id, subscribers, views, videos)
SELECT
  CURRENT_DATE,
  'yt_channel',
  ch.id::text,
  ch.project_id,
  ch.subscriber_count,
  COALESCE((SELECT SUM(v.view_count)::bigint FROM yt_videos v WHERE v.channel_id = ch.id), 0),
  ch.video_count
FROM yt_channels ch
ON CONFLICT (captured_at, source, entity_id) DO NOTHING;
