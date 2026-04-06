# CLAUDE.md

## Project

ContentOS — content operations platform (Next.js 14 + Supabase + BullMQ worker).
Repo: https://github.com/Tsaryuk/ContentOS

## Architecture

- **Frontend/API**: Next.js 14 App Router (`app/`, `components/`, `lib/`)
- **Worker**: BullMQ background processor (`worker.ts`) — transcription, AI generation, publishing
- **Database**: Supabase PostgreSQL (migrations in `supabase/migrations/`)
- **Queue**: Redis + BullMQ (`lib/queue.ts`)
- **Auth**: iron-session (`lib/session.ts`, `lib/auth.ts`, `middleware.ts`)
- **Deploy**: VPS + PM2 (`ecosystem.config.js`), auto-deploy via GitHub Actions webhook

## Development Workflow

1. Code runs locally at `localhost:3000` (Next.js) + `worker.ts` (separate process)
2. All changes go through git: commit -> push to `origin/main`
3. GitHub Actions auto-deploys to VPS via webhook on push to main
4. Never deploy manually — always through git push

### Commands

```bash
# Dev
npm run dev              # Next.js dev server
npx tsx worker.ts        # Worker (separate terminal)

# Deploy (automatic on push)
git push origin main     # Triggers GitHub Actions -> VPS webhook -> deploy.sh
```

## Code Preferences

- Keep responses concise, no emojis
- Do not refactor existing code unless explicitly asked
- Prefer editing existing files over creating new ones
- Avoid over-engineering — implement only what is requested
- Do not add comments, docstrings, or type annotations to code that was not changed
- Read files before modifying them
- Use TodoWrite to plan and track multi-step tasks

## Auth Pattern

All API routes must use `requireAuth()` or `requireAdmin()`:
```typescript
import { requireAuth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth instanceof NextResponse) return auth
  // ...
}
```

## Database

- Use `supabaseAdmin` from `@/lib/supabase` in API routes (service role)
- Schema lives in `supabase/migrations/` (14 migrations)
- Field naming: `current_title` (not `title`), `current_description`, etc.

## Environment

- Secrets in `.env.local` (never committed)
- Template: `.env.example`
- VPS secrets in GitHub Secrets (DEPLOY_HOST, DEPLOY_WEBHOOK_SECRET)
