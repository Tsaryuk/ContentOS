#!/bin/bash
set -e

cd /opt/contentos

echo "=== Pull latest code ==="
git pull origin main

echo "=== Install dependencies ==="
npm install --production=false

echo "=== Build ==="
NODE_OPTIONS="--max-old-space-size=1024" npm run build

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
