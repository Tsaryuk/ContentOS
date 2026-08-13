-- 047_vk_video.sql — VK Video integration (Phase 1: schema).
--
-- VK API can edit a video's title (name) and description (desc) via video.edit,
-- and list videos via video.get. It has NO public method to set a custom video
-- cover/thumbnail — covers stay manual in the VK studio.
--
-- Auth: a USER access token (admin of the community) with scope video,offline.
-- Community tokens lack the video scope. offline tokens don't expire, so there
-- is no refresh dance. A community video's owner_id is the NEGATIVE group id.
--
-- RLS is enabled with no permissive policy: all access goes through the service
-- role (supabaseAdmin), which bypasses RLS — matching the 045 RLS hardening.

create table if not exists vk_channels (
  id            uuid primary key default gen_random_uuid(),
  vk_owner_id   bigint not null unique,          -- negative for communities (-group_id)
  name          text not null,
  screen_name   text,
  photo_url     text,
  access_token  text,                            -- encrypted user token (video,offline)
  vk_user_id    bigint,                          -- VK user the token belongs to
  rules         jsonb not null default '{}'::jsonb,
  needs_reauth  boolean not null default false,
  is_active     boolean not null default true,
  project_id    uuid references projects(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists vk_videos (
  id                    uuid primary key default gen_random_uuid(),
  channel_id            uuid not null references vk_channels(id) on delete cascade,
  vk_owner_id           bigint not null,
  vk_video_id           bigint not null,
  current_title         text,
  current_description   text,
  generated_title       text,
  generated_description text,
  duration_seconds      int,
  views                 int,
  published_at          timestamptz,
  status                text not null default 'pending',
  is_published_back     boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (vk_owner_id, vk_video_id)
);

create index if not exists idx_vk_videos_channel on vk_videos(channel_id);

alter table vk_channels enable row level security;
alter table vk_videos   enable row level security;
