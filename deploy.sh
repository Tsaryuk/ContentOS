#!/bin/bash
cd /opt/contentos
git pull origin main
npm install --production=false
NODE_OPTIONS="--max-old-space-size=1024" npm run build
pm2 restart ecosystem.config.js
echo "Deploy complete: $(date)"
