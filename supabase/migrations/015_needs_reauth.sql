-- Track which YouTube channels need OAuth re-authentication
-- Set to TRUE when refresh_token becomes invalid (invalid_grant / unauthorized_client)
-- Cleared when user successfully reconnects via OAuth flow

ALTER TABLE yt_channels
  ADD COLUMN IF NOT EXISTS needs_reauth BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS yt_channels_needs_reauth_idx
  ON yt_channels (needs_reauth) WHERE needs_reauth = TRUE;
