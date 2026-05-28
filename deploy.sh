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
pm2 restart ecosystem.config.js

echo "=== Content Ideas Agent (Python service) ==="
if [ -f services/content-ideas-agent/.env ]; then
  cd services/content-ideas-agent
  docker compose up -d --build
  cd /opt/contentos
else
  echo "skip: services/content-ideas-agent/.env not found"
fi

echo "Deploy complete: $(date)"
