-- ============================================================
-- ContentOS — YouTube Module
-- Supabase migration: 001_youtube_module.sql
-- ============================================================

-- ─── Каналы ──────────────────────────────────────────────────
create table if not exists yt_channels (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),

  -- YouTube
  yt_channel_id text unique not null,   -- UC...
  handle        text,                   -- @doliidengi
  title         text not null,
  thumbnail_url text,
  subscriber_count bigint,
  video_count   int,

  -- Правила канала (ContentOS)
  rules         jsonb default '{
    "title_format":       "",
    "description_template": "",
    "required_links":     [],
    "hashtags_fixed":     [],
    "thumbnail_style_id": "",
    "shorts_count":       3,
    "clip_max_minutes":   10
  }'::jsonb,

  -- Цвет в интерфейсе
  color         text default '#a67ff0',
  is_active     boolean default true
);

-- ─── Видео ───────────────────────────────────────────────────
create table if not exists yt_videos (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),

  channel_id    uuid references yt_channels(id) on delete cascade,
  yt_video_id   text unique not null,   -- dQw4w9WgXcQ

  -- Текущие данные с YouTube (как есть сейчас)
  current_title       text,
  current_description text,
  current_tags        text[],
  current_thumbnail   text,
  duration_seconds    int,
  published_at        timestamptz,
  view_count          bigint,
  like_count          bigint,

  -- Сгенерированные ContentOS
  generated_title       text,
  generated_description text,
  generated_tags        text[],
  generated_timecodes   jsonb,   -- [{time: "00:00", label: "Intro"}, ...]
  generated_clips       jsonb,   -- [{start: 120, end: 720, title: "...", type: "clip|short"}]
  transcript            text,
  transcript_chunks     jsonb,   -- [{start, end, text}] — для тайм-кодов
  thumbnail_url         text,    -- сгенерированная обложка (Recraft)
  ai_score              int,     -- 0–100

  -- Статус конвейера
  status        text default 'pending'
                check (status in (
                  'pending',        -- не начато
                  'transcribing',   -- скачивается / транскрибируется
                  'generating',     -- Claude генерирует контент
                  'thumbnail',      -- Recraft рисует обложку
                  'review',         -- готово, ждёт проверки
                  'publishing',     -- публикуется в YouTube
                  'done',           -- опубликовано
                  'error'           -- ошибка
                )),
  error_message text,

  -- Флаги
  is_published_back boolean default false,  -- обновлено ли в YouTube
  is_approved       boolean default false   -- одобрено ли вручную
);

-- Автообновление updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger yt_videos_updated_at
  before update on yt_videos
  for each row execute function update_updated_at();

-- ─── Джобы обработки ─────────────────────────────────────────
create table if not exists yt_jobs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  started_at  timestamptz,
  finished_at timestamptz,

  video_id    uuid references yt_videos(id) on delete cascade,
  job_type    text not null
              check (job_type in (
                'sync_channel',    -- вытянуть список видео
                'transcribe',      -- Whisper
                'generate',        -- Claude
                'thumbnail',       -- Recraft
                'publish'          -- YouTube update
              )),
  status      text default 'queued'
              check (status in ('queued','running','done','failed')),
  result      jsonb,
  error       text,
  attempts    int default 0
);

-- ─── Логи изменений (аудит) ──────────────────────────────────
create table if not exists yt_changes (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  video_id   uuid references yt_videos(id) on delete cascade,
  field      text,          -- 'title' | 'description' | 'tags' | 'thumbnail'
  old_value  text,
  new_value  text,
  source     text           -- 'ai' | 'manual'
);

-- ─── Индексы ─────────────────────────────────────────────────
create index if not exists idx_yt_videos_channel  on yt_videos(channel_id);
create index if not exists idx_yt_videos_status   on yt_videos(status);
create index if not exists idx_yt_jobs_status     on yt_jobs(status);
create index if not exists idx_yt_jobs_video      on yt_jobs(video_id);

-- ─── RLS (Row Level Security) ────────────────────────────────
-- Пока отключаем — включим когда добавим auth
alter table yt_channels disable row level security;
alter table yt_videos   disable row level security;
alter table yt_jobs     disable row level security;
alter table yt_changes  disable row level security;

-- ─── Сид: канал Личная философия ────────────────────────────
-- yt_channel_id заполнится автоматически после первого sync
-- Узнать свой UC... можно здесь:
-- youtube.com/@denis.tsaryuk → About → Share → скопировать ссылку
-- или: https://www.youtube.com/channel/[UC...]
insert into yt_channels (yt_channel_id, handle, title, color, rules)
values
  ('UCSNzUPA6aagf1XD37oXQWsw', '@denis.tsaryuk', 'Личная философия', '#6b9ff0', '{
    "title_format":          "Личный нарратив — вывод или вопрос",
    "description_template":  "История:\n\n{summary}\n\nВыводы:\n{key_points}\n\nТайм-коды:\n{timecodes}\n\nТелеграм: https://t.me/lichnaya_filosofiya",
    "required_links":        ["https://t.me/lichnaya_filosofiya"],
    "hashtags_fixed":        ["#личнаяФилософия", "#саморазвитие", "#философия"],
    "thumbnail_style_id":    "",
    "shorts_count":          2,
    "clip_max_minutes":      10
  }'::jsonb)
on conflict do nothing;
