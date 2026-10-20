#!/usr/bin/env bash
# Starts databases, the web app (port 3000) and the worker in the background.
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p .logs
sudo service postgresql start >/dev/null
sudo service redis-server start >/dev/null
pkill -f "next start" 2>/dev/null; pkill -f "src/worker/index.ts" 2>/dev/null
nohup npx next start -H 0.0.0.0 -p 3000 > .logs/web.log 2>&1 &
nohup npm run worker > .logs/worker.log 2>&1 &
URL=$(grep -E "^APP_URL=" .env | cut -d= -f2-)
echo "✓ SAHAR FACE MOTION AI is starting: ${URL:-port 3000} (logs in sahar-face-motion-ai/.logs)"
echo "${URL}" > .logs/URL.txt
