# ContentOS — Roadmap

## Что мы строим

Операционная система для контент-продюсера: one video in → entire content universe out
(YouTube + Telegram + Newsletter + Blog + Carousels). Человек в петле, AI делает ремесло.

## Sprint 1 — Observability & Cost (текущий)

Цель: увидеть систему. Без этого все остальные улучшения — вслепую.

- [ ] **1.1 Sentry** — error reporting в `contentos` и `worker`. Breadcrumbs для BullMQ jobs.
- [ ] **1.2 pino structured logger** — заменить `console.log` в worker.ts и hot-path в API на JSON-логи с level/module/videoId/traceId.
- [ ] **1.3 Cost tracking** — таблица `ai_usage(model, input_tokens, output_tokens, cost_usd, video_id, task, created_at)`. Обёртки в claudeWithRetry / openai.audio / fal.subscribe / Recraft. `/admin/costs` страница: день/неделя/месяц × модель × задача.
- [ ] **1.4 Calendar view** — `/calendar` объединяет video.published_at, tg_posts.scheduled_at, nl_issues.scheduled_at на одной timeline.
- [ ] **1.5 Dashboard metrics** — SQL-агрегация view_count / like_count / subscriber_count по каналам и периодам вместо хардкода в app/page.tsx.
- [ ] **1.6 Idempotency на publish** — ключ в BullMQ job payload, дубли отбрасываются.

## Sprint 2 — Growth

- [ ] A/B тесты заголовков/обложек через YouTube thumbnail tests API
- [ ] AI ideation — "Что снимать?" из best-performing + transkripts гостей + trends
- [ ] Multi-user + real RBAC с approval workflow
- [ ] Podcast pipeline — RSS + Apple/Spotify
- [ ] Competitor tracker — еженедельный snapshot + AI анализ стратегии

## Sprint 3 — Quality

- [ ] Playwright E2E для критических путей (login, publish, transcribe)
- [ ] Staging environment (VPS + отдельный Supabase проект или branch)
- [ ] Мигрировать iron-session → Supabase Auth когда появится потребность в RLS для клиента

## Долгосрочно (продуктовые решения)

- [ ] SaaS-пивот — multi-tenant, биллинг, onboarding для русскоязычных YouTube-авторов
- [ ] Mobile companion — быстрый capture идей / voice notes → drafts в Articles
- [ ] Voice agent — Telegram-бот с разговорным интерфейсом к ContentOS
