# Content Ideas Agent

AI-агент для мониторинга источников и генерации идей контента (Telegram / YouTube / Podcast / Email / Reels) для Content OS Дениса Царюка.

Стек: Python 3.12 · LangGraph · Claude Sonnet 4 · Supabase · Docker.

## MVP scope

- Источники: YouTube RSS, Gmail IMAP
- Pipeline: monitor → extract topics → score relevance → generate ideas → notify
- Форматы: `telegram`, `youtube`
- Уведомления: Telegram bot (мгновенно при score ≥ 85)
- Расписание: каждые 6 часов через APScheduler

## Quick start

```bash
cp .env.example .env
# заполнить ключи

# Применить SQL миграцию в Supabase Dashboard или psql:
psql "$DATABASE_URL" -f supabase/migrations/001_initial_schema.sql

# Засеять источники:
python scripts/seed_sources.py

# Локальный разовый прогон:
python scripts/run_once.py

# Production (VPS):
docker compose up -d --build
docker compose logs -f
```

## Структура

```
content-ideas-agent/
├── docker-compose.yml
├── Dockerfile
├── config.yaml
├── requirements.txt
├── supabase/migrations/001_initial_schema.sql
├── src/
│   ├── main.py            # entry + APScheduler
│   ├── graph.py           # LangGraph state machine
│   ├── config.py          # YAML + env loader
│   ├── agents/            # monitor / extractor / scorer / generator
│   ├── sources/           # youtube / email_parser
│   ├── integrations/      # supabase_client / telegram_bot
│   └── utils/             # prompts / hashing / logger
└── scripts/
    ├── run_once.py
    └── seed_sources.py
```

См. полное ТЗ: `~/Downloads/content_ideas_tz.md`.
