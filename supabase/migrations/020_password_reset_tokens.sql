-- 020_password_reset_tokens.sql — password recovery flow
--
-- Stores hashed single-use tokens issued by /api/auth/forgot-password and
-- verified by /api/auth/reset-password. Only the hash is stored, never the
-- plaintext token — same threat model as password_hash itself.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);

-- Reuse existing app-level auth (requireAuth) — no additional RLS needed
-- since all access goes through supabaseAdmin (service role bypasses RLS).
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on password_reset_tokens"
  ON password_reset_tokens FOR ALL USING (true);
