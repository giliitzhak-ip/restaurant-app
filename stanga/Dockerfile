# The STANGA authoritative server.
#
# The server runs the same TypeScript the browser does — the whole point of the
# stage-3 architecture is that there is one MatchEngine, not two — so the image
# runs it through tsx rather than shipping a separately compiled copy that could
# drift from the client build.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# The lockfile decides the versions; nothing is resolved at build time.
# tsx is a devDependency but the server needs it to run, so it is added here,
# pinned to the same version package.json holds, rather than pulling in the
# whole dev tree. Keep the two in step when upgrading.
RUN npm ci --omit=dev --ignore-scripts \
  && npm install --no-save --ignore-scripts tsx@4.23.14

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

# Never root: the process only needs to read its own files and listen.
USER node

ENV PORT=2567
ENV HOST=0.0.0.0
EXPOSE 2567

# The health check hits the same endpoint the load balancer should use.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||2567)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npx", "tsx", "src/server/index.ts"]
