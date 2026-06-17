-- 046_podcast_audio_bucket.sql — public Storage bucket for podcast episode audio.
--
-- publishEpisode() (lib/podcasts/publish-episode.ts) extracts a 64 kbps mono mp3
-- from the source YouTube video, uploads it here, and stores the resulting public
-- URL in podcast_episodes.audio_url. The RSS feed (app/podcasts/[slug]/feed.xml)
-- serves that URL in <enclosure>, and Mave.digital pulls the feed to distribute to
-- Apple Podcasts / Spotify / Yandex Music / VK / Zvuk / Castbox.
--
-- public=true: episodes must be fetchable by podcast platforms without auth.
-- file_size_limit 200MB: a multi-hour talk at 64 kbps mono can reach tens of MB.
-- Uploads run with the service role (supabaseAdmin), which bypasses RLS.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('podcast-audio', 'podcast-audio', true, 209715200, array['audio/mpeg'])
on conflict (id) do nothing;
