# syntax=docker/dockerfile:1.7
# ── Base ──────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat

# ── Dependencies (cached unless the lockfile changes) ────────────────────────
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

# ── Build ─────────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ── Runtime: standalone server only (~small image, no dev dependencies) ──────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production \
    TZ=Asia/Tehran \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN apk add --no-cache tzdata \
 && addgroup -S -g 1001 app && adduser -S -u 1001 -G app app

COPY --from=builder /app/public ./public
COPY --from=builder --chown=app:app /app/.next/standalone ./
COPY --from=builder --chown=app:app /app/.next/static ./.next/static
# Migrations are applied by the server on start (instrumentation.ts → boot()).
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/scripts/hash-password.mjs ./scripts/hash-password.mjs

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
CMD ["node", "server.js"]
