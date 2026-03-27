-- Add refresh_token and updated_at to yt_channels for per-channel OAuth
ALTER TABLE yt_channels
  ADD COLUMN IF NOT EXISTS refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
