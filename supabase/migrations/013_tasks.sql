-- 013_tasks.sql — Tasks module

CREATE TABLE IF NOT EXISTS tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  description   TEXT,

  status        TEXT NOT NULL DEFAULT 'todo'
                CHECK (status IN ('todo', 'in_progress', 'review', 'done')),
  priority      TEXT NOT NULL DEFAULT 'medium'
                CHECK (priority IN ('low', 'medium', 'high', 'urgent')),

  assignee_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  creator_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,

  due_date      DATE,

  related_type  TEXT CHECK (related_type IN ('video', 'clip', 'carousel')
                            OR related_type IS NULL),
  related_id    UUID,

  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_priority ON tasks(priority);
CREATE INDEX idx_tasks_due_date ON tasks(due_date);
CREATE INDEX idx_tasks_creator ON tasks(creator_id);
CREATE INDEX idx_tasks_related ON tasks(related_type, related_id);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all on tasks" ON tasks FOR ALL USING (true);
