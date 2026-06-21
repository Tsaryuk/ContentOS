-- 045_rls_enable.sql
-- Включение RLS на таблицах, оставшихся после 040_rls_hardening.
-- Паттерн 040: RLS включён без политик — anon/authenticated полностью
-- заблокированы, service_role (supabaseAdmin) не затрагивается.
-- Anon-ключ в коде приложения не используется (проверено: ни одного
-- обращения к NEXT_PUBLIC_SUPABASE_ANON_KEY вне .env).

ALTER TABLE comment_reply_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE yt_transcript_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE nl_article_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE cover_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE cover_generations ENABLE ROW LEVEL SECURITY;
