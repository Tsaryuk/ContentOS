# ContentOS

Операционная система управления контентом.

## Структура

```
app/
  youtube/          — страница управления YouTube-каналом
  api/
    youtube/
      sync/         — читает видео с YouTube → Supabase (read-only)
    process/
      transcribe/   — Whisper API транскрипция
      generate/     — Claude API генерация контента
      thumbnail/    — Recraft API генерация обложек

lib/
  supabase.ts       — клиент Supabase
  youtube/
    auth.ts         — OAuth токен
    videos.ts       — чтение видео с YouTube API

supabase/
  migrations/
    001_youtube_module.sql
```

## Env variables

Скопируй `.env.example` → `.env.local` и заполни ключи.

## ⚠️ Важно

YouTube-канал не изменяется без явного подтверждения.
Все изменения проходят через статус `is_approved = true`.

## Deploy

Vercel → подключи GitHub → добавь env variables → deploy.
