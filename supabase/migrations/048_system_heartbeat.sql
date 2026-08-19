-- 048_system_heartbeat.sql
-- Пульс фоновых процессов + цель для проверки записи в БД.
--
-- Зачем: 29.07–13.08 воркер и приложение работали с ключом уровня anon, и все
-- записи в БД молча уходили в никуда — RLS отказывает не кодом 4xx, а пустым
-- результатом. Health-роут при этом был зелёным: он делал только SELECT, и как
-- раз по yt_videos, единственной таблице с разрешающей политикой для anon.
-- Здесь запись идёт в таблицу БЕЗ политик, поэтому anon её провалит.

create table if not exists system_heartbeat (
  component text primary key,
  beat_at timestamptz not null default now(),
  detail text
);

alter table system_heartbeat enable row level security;

insert into system_heartbeat (component, detail)
values ('worker', 'seeded by migration')
on conflict (component) do nothing;
