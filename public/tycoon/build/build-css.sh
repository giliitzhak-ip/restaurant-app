#!/usr/bin/env sh
# Regenerate the committed Tailwind stylesheet.
# Requires network access once: npm i -D tailwindcss@3.4.17
set -e
cd "$(dirname "$0")/../../.."
npx tailwindcss \
  -c public/tycoon/build/tailwind.config.js \
  -i public/tycoon/build/tailwind.input.css \
  -o public/tycoon/css/tailwind.css \
  --minify
echo "Wrote public/tycoon/css/tailwind.css"
