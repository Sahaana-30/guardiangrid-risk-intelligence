# GuardianGrid Express API Container (Google Cloud Run)
# Builds dist-server/server.mjs and runs with production-only dependencies on $PORT (default 8080).

FROM node:22-bookworm-slim AS deps-base
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json .npmrc ./

FROM deps-base AS builder
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY scripts ./scripts
COPY server.ts ./
COPY server ./server
COPY src ./src
COPY firebase-applet-config.json ./
RUN node scripts/build-server.mjs

FROM deps-base AS prod-deps
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json

RUN mkdir -p /app/server/data && chown -R node:node /app
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "dist-server/server.mjs"]
