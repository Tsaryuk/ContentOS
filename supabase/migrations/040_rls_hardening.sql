-- Security hardening: enable RLS across public tables, drop always-true
-- policies, pin function search_path, close broad storage listing.
--
-- Background: the app uses `supabaseAdmin` (service_role key) for every
-- DB write and for most reads, and service_role bypasses RLS. The only
-- browser-side anon reads go to `yt_videos` (carousels/new, youtube list).
-- We can therefore lock everything else down without breaking the app.
--
-- Fixes Supabase advisor errors:
--   * rls_disabled_in_public on 17 tables
--   * sensitive_columns_exposed on google_accounts, yt_channels (refresh_token)
--   * rls_policy_always_true on 12 tables
--   * function_search_path_mutable on public.update_updated_at
--   * public_bucket_allows_listing on storage.objects (articles, thumbnails)

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Enable RLS on every public table that lacked it.
--    No policies added for most — admin bypasses RLS, anon is blocked.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.yt_jobs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yt_changes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yt_channels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yt_videos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.yt_comments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tg_accounts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tg_channels         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tg_posts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_accounts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clip_candidates     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nl_campaigns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nl_ai_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nl_article_images   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nl_issues           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nl_article_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nl_articles         ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. yt_videos is the only table read from the browser with the anon key.
--    Allow anon/authenticated SELECT; writes still go through /api routes
--    which use service_role and bypass RLS.
--    Long-term fix: move these browser queries to /api handlers so we can
--    drop this broad SELECT, but that's out of scope here.
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "anon_read_yt_videos" ON public.yt_videos;
CREATE POLICY "anon_read_yt_videos"
  ON public.yt_videos
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Drop the "Allow all" RLS policies that effectively disable RLS for
--    anon and authenticated roles. Server code uses service_role (bypasses
--    RLS regardless), so these policies were never protecting anything and
--    advertised the tables as reachable from the anon key.
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Allow all on ai_usage"              ON public.ai_usage;
DROP POLICY IF EXISTS "Allow all on carousel_voices"       ON public.carousel_voices;
DROP POLICY IF EXISTS "Allow all on carousels"             ON public.carousels;
DROP POLICY IF EXISTS "Allow all on content_pieces"        ON public.content_pieces;
DROP POLICY IF EXISTS "Allow all on metric_snapshots"      ON public.metric_snapshots;
DROP POLICY IF EXISTS "Allow all on password_reset_tokens" ON public.password_reset_tokens;
DROP POLICY IF EXISTS "Allow all on podcast_episodes"      ON public.podcast_episodes;
DROP POLICY IF EXISTS "Allow all on podcast_shows"         ON public.podcast_shows;
DROP POLICY IF EXISTS "Allow all on short_links"           ON public.short_links;
DROP POLICY IF EXISTS "Allow all on tasks"                 ON public.tasks;
DROP POLICY IF EXISTS "Allow all on users"                 ON public.users;
DROP POLICY IF EXISTS "Allow all on yt_social_drafts"      ON public.yt_social_drafts;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Pin search_path on update_updated_at so a hijacked schema can't
--    shadow functions/operators the trigger uses at runtime.
-- ─────────────────────────────────────────────────────────────────────────

ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_temp;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Public buckets don't need a broad SELECT policy on storage.objects for
--    URL-based reads — CDN serves the object directly. The policy only
--    enables API-side listing, which is exactly the leak the advisor
--    flagged. Drop both.
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "articles_public_select" ON storage.objects;
DROP POLICY IF EXISTS "Public read thumbnails" ON storage.objects;
