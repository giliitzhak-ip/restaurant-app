# One image for both processes. Run the web app with the default command and
# the worker with `npm run worker`. Includes FFmpeg, Python and OpenCV, plus the
# face-detection models (checksums verified at build time).
FROM node:22-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv ca-certificates openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build && npm run models:download

FROM base AS runtime
ENV NODE_ENV=production PYTHON_BIN=/app/.venv/bin/python
COPY ai/requirements.txt ai/requirements.txt
RUN python3 -m venv .venv && .venv/bin/pip install --no-cache-dir -r ai/requirements.txt
COPY --from=build /app ./
RUN npm prune --omit=dev --ignore-scripts && npm i --no-save prisma@6.19.3
EXPOSE 3000
# Apply DB migrations, then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -H 0.0.0.0 -p ${PORT:-3000}"]
