#!/usr/bin/env bash
# Builds the single-file PRO NETWORK prototype from src/.
#   dist/pro-network.artifact.html  – body-only page (the artifact host adds <html>/<head>)
#   ../public/pro-network.html      – standalone page served by server.js at /pro-network.html
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p dist
{
  cat src/01-head.html src/02-body.html
  echo '<script>'
  cat src/03-core.js src/04-ui.js src/05-customer.js src/06-pro.js src/07-admin.js src/08-events.js
  echo '</script>'
} > dist/pro-network.artifact.html
{
  echo '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes">'
  echo '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>'
  cat dist/pro-network.artifact.html
  echo '</html>'
} > ../public/pro-network.html
echo "built: $(wc -c < dist/pro-network.artifact.html) bytes"
