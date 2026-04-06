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

echo "Deploy complete: $(date)"
