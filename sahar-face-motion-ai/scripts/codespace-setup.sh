#!/usr/bin/env bash
# One-time setup inside GitHub Codespaces (runs automatically on creation).
# Installs PostgreSQL, Redis, FFmpeg and Python, then the app, face detection and FaceFusion.
# Everything runs in Free Mode with local disk storage: no paid service is used.
set -euo pipefail
cd "$(dirname "$0")/.."

sudo apt-get update -y
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql redis-server ffmpeg python3-venv
sudo service postgresql start
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='sahar'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE USER sahar WITH PASSWORD 'sahar' CREATEDB;"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='sahar'" | grep -q 1 \
  || sudo -u postgres createdb -O sahar sahar
sudo service redis-server start

if [ ! -f .env ]; then
  cp .env.example .env
  PUBLIC_URL="https://${CODESPACE_NAME:-localhost}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
  sed -i \
    -e "s#^APP_URL=.*#APP_URL=${PUBLIC_URL}#" \
    -e "s#^APP_SECRET=.*#APP_SECRET=$(openssl rand -hex 32)#" \
    -e "s#^NODE_ENV=.*#NODE_ENV=production#" \
    -e "s#^STORAGE_DRIVER=.*#STORAGE_DRIVER=local#" \
    -e "s#^FREE_MODE=.*#FREE_MODE=true#" \
    -e "s#^PYTHON_BIN=.*#PYTHON_BIN=$(pwd)/.venv/bin/python#" \
    .env
fi

npm ci
python3 -m venv .venv && .venv/bin/pip install -q -r ai/requirements.txt
npm run models:download
npx prisma migrate deploy
npm run build

# The free open-source engine. Skippable: SKIP_FACEFUSION=1
if [ "${SKIP_FACEFUSION:-0}" != "1" ]; then
  if bash scripts/setup-facefusion.sh; then
    sed -i "s#^FACE_SWAP_PROVIDER=.*#FACE_SWAP_PROVIDER=facefusion-local#" .env
  else
    echo "⚠ FaceFusion setup failed; the mock engine stays the default. Retry: bash sahar-face-motion-ai/scripts/setup-facefusion.sh"
  fi
fi
echo "✓ setup complete"
