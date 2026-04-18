# ContentOS — Roadmap

## Что мы строим

Операционная система для контент-продюсера: one video in → entire content universe out
(YouTube + Telegram + Newsletter + Blog + Carousels). Человек в петле, AI делает ремесло.

---

## Закрыто до 2026-04-18

### Security + Infra
- Middleware actual session decrypt, requireAuth на всех API routes
- OAuth CSRF guard (state parameter), SSRF URL whitelist
- Path-traversal guard для blog_slug, mass-assignment allowlist
- execFile вместо execSync в worker (+ yt_video_id validation)
- IDOR — destructive actions → requireAdmin
- HTML sanitize server-side (sanitize-html)
- Rate limiting (Redis) на login / subscribe / telegram_auth_start
- Security headers (XFO, nosniff, HSTS, Referrer-Policy, Permissions-Policy)
- AES-256-GCM шифрование refresh_token + Telegram session_string
- Password recovery flow + hide app shell на auth страницах
- VPS upgraded 2GB → 4GB / 2 vCPU

### Sprint 1 — Observability & Cost
- Sentry (client/server/edge/worker) с тегами route / video.id / user.id
- pino structured logger в worker hot-path
- BullMQ idempotency (`enqueueProcessJob` helper, jobId `<task>--<uuid>`)
- Pipeline-order guard в updateStatus (без отката назад)
- handleApiError + global-error.tsx для надёжных stacktrace'ов
- ai_usage table + regex price table + Russian labels + project split
- `/admin/costs` + `/admin` landing + admin layout guard
- `/calendar` объединённый view (video + tg + nl_issues + nl_articles)
- Dashboard metrics server aggregation + metric_snapshots daily cron
- Growth deltas: Сутки / Неделя / Месяц toggle
- Newsletter widget scope по project + delta banner

### Sprint 2.2 — Longform multiplication
- content_pieces table (threads / video_script / telegram / newsletter_summary)
- Threads generator в стиле @thedankoe (5-7 candidates, без эмодзи)
- Video script generator для «Денис Царюк / Личная стратегия» с блоками по ~2 мин
- UI на /articles/[id] → Distribute tab

### YouTube channels auto-refresh
- Ежедневный refresh subscriber_count / video_count через YouTube Data API
- Worker cron + on-demand admin endpoint
- Snapshot'ы получают актуальные views от YT API

---

## Следующая сессия — приоритеты

### 1. Deep link к выпускам (tapthe.link-like, запрос user'а)

Референс — https://app.tapthe.link

Проблема: ссылка на YouTube, расшаренная в Instagram/Threads/Telegram, открывается
во встроенном браузере, а не в нативном приложении YouTube. Deep link
с user-agent detection это решает.

Архитектура:
- Таблица `short_links(slug, kind, target_url, video_id, clicks, created_at)`
- Route `app/v/[slug]/route.ts` — user-agent sniff:
  - Instagram / FB / Messenger in-app → HTML с `youtube://` scheme attempt + web fallback
  - Прямо в YouTube app / обычный browser → 302 на youtube.com/watch?v=...
- Короткий URL вида `huuman.ru/v/<slug>`
- UI на странице видео: кнопка «Получить deep link» + QR-код для sharing
- Аналитика по кликам (counter в short_links.clicks)

### 2. Per-account re-auth UX в Settings

5 brand-аккаунтов Google, каждый канал = отдельный. UI должен показывать
список каналов с last_refresh и `needs_reauth` badge, кнопка «Переподключить»
прицельно на канал. ЭКСПЕДИЦИЯ-канал пока без project_id — нужен селектор проекта.

### 3. Новые видео / комментарии без ручных кликов

- Video sync cron — запускает `/api/youtube/sync` для каждого канала раз в сутки
- Comments sync cron — `/api/comments/sync` раз в сутки

---

## Sprint 2 — Growth

- A/B тесты заголовков/обложек через YouTube thumbnail tests API
- AI ideation — «Что снимать?» из best-performing + transcripts гостей
- Multi-user + real RBAC с approval workflow
- Carousel-генератор из статьи
- Telegram-пост из статьи
- Podcast pipeline — RSS + Apple/Spotify
- Competitor tracker — еженедельный snapshot + AI анализ

## Sprint 3 — Quality

- Playwright E2E для критических путей (login, publish, transcribe)
- Staging environment
- Мигрировать iron-session → Supabase Auth когда появится потребность в RLS

## Долгосрочно (продуктовые решения)

- SaaS-пивот — multi-tenant, биллинг, onboarding
- Mobile companion — быстрый capture идей / voice notes
- Voice agent — Telegram-бот с разговорным интерфейсом
