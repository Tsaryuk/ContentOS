#!/bin/bash
set -e

cd /opt/contentos

echo "=== Sync code to origin/main ==="
# The app regenerates tracked files at runtime (services/letters-site/*.html
# on every letters publish), which leaves the working tree dirty. A plain
# `git pull` then aborts with "local changes would be overwritten by merge",
# fails under `set -e`, and the webhook returns HTTP 500 — silently blocking
# every deploy. The repo is the source of truth on deploy, so hard-reset to
# origin/main. Untracked files (.env.local, *.bak) are preserved by reset.
git fetch origin main
git reset --hard origin/main

echo "=== Install dependencies ==="
npm install --production=false

echo "=== Build ==="
# Heap bumped from 1024 → 2048: the build hadn't run for several merges and
# 1 GB is tight for this Next + TipTap + Sentry app. The box has ~3.9 GB.
NODE_OPTIONS="--max-old-space-size=2048" npm run build

echo "=== Restart services ==="
# `pm2 restart` reuses the env pm2 already holds in memory and never re-reads
# .env.local, so a changed secret silently does not reach the processes. On
# 2026-07-29 an unattended-upgrades restart brought the processes up from a
# stale ~/.pm2/dump.pm2 carrying an old SUPABASE_SERVICE_KEY; every DB write
# then no-oped for two weeks without a single error (RLS denies by returning
# empty results, not 4xx). `--update-env` forces the re-read and `pm2 save`
# rewrites the dump so the next OS-triggered restart cannot resurrect it.
pm2 startOrRestart ecosystem.config.js --update-env
pm2 save

echo "=== Content Ideas Agent (Python service) ==="
if [ -f services/content-ideas-agent/.env ]; then
  cd services/content-ideas-agent
  docker compose up -d --build
  cd /opt/contentos
else
  echo "skip: services/content-ideas-agent/.env not found"
fi

echo "Deploy complete: $(date)"
