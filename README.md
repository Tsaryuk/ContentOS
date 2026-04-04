# ContentOS

Content operations platform for YouTube channels and Telegram channels. Automates video transcription, AI content generation, thumbnail creation, carousel posts, clip extraction, and cross-platform publishing.

## Architecture

```
Next.js 14 (App Router)          BullMQ Worker (tsx)
       |                                |
       |  API Routes (/api/*)           |  Job handlers
       |  Pages (SSR/CSR)               |  transcribe / generate / produce
       |                                |  publish / thumbnail / clips
       v                                v
  ┌──────────┐                   ┌──────────┐
  │ Supabase │ <───────────────> │  Redis   │
  │ Postgres │                   │ (BullMQ) │
  └──────────┘                   └──────────┘
       ^
       |
  External APIs: YouTube Data API, Whisper (OpenAI), Claude (Anthropic),
                 Recraft, fal.ai, Telegram MTProto
```

### Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS, Framer Motion |
| Backend | Next.js API Routes, BullMQ worker process |
| Database | Supabase (PostgreSQL) |
| Queue | Redis + BullMQ |
| AI | OpenAI Whisper, Anthropic Claude, Recraft, fal.ai |
| Integrations | YouTube Data API v3, Telegram MTProto |
| Deploy | VPS + PM2, GitHub Actions webhook |

### Directory Structure

```
app/
  page.tsx                  Dashboard (project overview)
  youtube/                  YouTube channel management
  clips/                    Clip extraction from videos
  carousels/                Carousel post editor
  telegram/                 Telegram channel management
  tasks/                    Task board (kanban)
  settings/                 User settings
  login/                    Authentication
  api/
    auth/                   Login, logout, session, OAuth
    youtube/                Sync videos, OAuth flow
    process/                Pipeline: transcribe -> generate -> produce -> publish
    thumbnail/              AI thumbnail generation & upload
    carousel/               Generate, illustrate, export carousels
    telegram/               Auth, posts, AI suggestions
    clips/                  Clip analysis & processing
    comments/               YouTube comment sync & AI drafts
    projects/               Multi-project management
    tasks/                  Task CRUD
    users/                  User management
    health/                 System health check

components/
  layout/                   Sidebar, ProjectSwitcher, ThemeToggle
  dashboard/                Channel cards, metrics, filters
  youtube/                  Video detail components (transcript, thumbnails, clips)
  carousel/                 Slide editor, preview
  telegram/                 Post editor, AI suggestions, channel connect
  tasks/                    Board, columns, cards, drawer, filters
  ui/                       Shared UI primitives (badge, card)

lib/
  supabase.ts               Supabase client (admin + anon, lazy-init proxy)
  auth.ts                   Authentication helpers
  session.ts                Iron-session config
  queue.ts                  BullMQ queue connection
  ai-models.ts              AI model configuration
  youtube/                  YouTube API client, OAuth
  telegram/                 MTProto client, sender, auth store
  carousel/                 Carousel prompts & types
  process/                  Pipeline helpers, prompts, types, thumbnail generator
  tasks/                    Task types

worker.ts                   Background job processor (BullMQ)
middleware.ts               Auth middleware (iron-session + legacy cookie)
ecosystem.config.js         PM2 process config (web + worker)
deploy.sh                   VPS deploy script
```

### Database Schema (14 migrations)

| Table | Purpose |
|-------|---------|
| `yt_channels` | YouTube channels with rules, OAuth tokens |
| `yt_videos` | Videos with current/generated metadata, pipeline status |
| `yt_social_drafts` | AI-generated social media drafts per video |
| `yt_video_changes` | Audit log of field changes |
| `yt_video_job_logs` | Pipeline job execution history |
| `yt_comments` | YouTube comments (synced) |
| `yt_clip_candidates` | AI-identified clip segments |
| `carousels` / `carousel_slides` | Carousel content & slides |
| `carousel_voices` | Brand voice training data |
| `projects` | Multi-project organization |
| `users` | User accounts (bcrypt) |
| `tasks` | Task management |
| `tg_accounts` / `tg_channels` / `tg_posts` | Telegram integration |

### Video Processing Pipeline

```
sync -> transcribe -> generate -> produce -> review -> publish
  |         |             |           |                   |
  |     Whisper API   Claude API   Claude API       YouTube API
  |     (audio->text)  (content)   (thumbnails,     (update video)
  |                                 titles, social)
  YouTube
  Data API
```

## Setup

### Prerequisites

- Node.js 20+
- Redis
- Supabase project
- ffmpeg, yt-dlp (for video processing)

### Install

```bash
git clone https://github.com/Tsaryuk/ContentOS.git
cd ContentOS
npm install
cp .env.example .env.local
# Fill in API keys in .env.local
```

### Run migrations

Apply SQL files from `supabase/migrations/` in order to your Supabase project.

### Development

```bash
npm run dev          # Next.js dev server (port 3000)
npx tsx worker.ts    # Worker process (separate terminal)
```

### Production (VPS)

```bash
pm2 start ecosystem.config.js   # Starts web + worker
```

## Environment Variables

See `.env.example` for the full list. Key groups:

- **Supabase** -- database connection (URL + service key + anon key)
- **YouTube** -- OAuth client credentials + refresh token
- **AI APIs** -- Anthropic, OpenAI, Recraft, fal.ai keys
- **Telegram** -- MTProto API ID + hash
- **Redis** -- BullMQ queue connection
- **Session** -- iron-session secret

## Deploy

GitHub Actions triggers a webhook on push to `main`. The VPS runs `deploy.sh` which pulls, builds, and restarts PM2.

Required GitHub Secrets:
- `DEPLOY_HOST` -- VPS webhook URL (e.g. `http://your-ip:9000`)
- `DEPLOY_WEBHOOK_SECRET` -- HMAC secret for webhook signature
