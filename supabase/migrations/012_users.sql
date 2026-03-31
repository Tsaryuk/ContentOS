-- 012_users.sql — Users & authentication

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'manager'
                CHECK (role IN ('admin', 'manager')),
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on users" ON users FOR ALL USING (true);
