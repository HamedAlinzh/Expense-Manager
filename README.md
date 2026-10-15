# Expense Manager

A self-hosted, single-user expense manager for Iranian bank cards (Sepah, Mellat, Tejarat, Blu). Transactions arrive from forwarded bank SMS and app notifications, and from a Telegram bot.

> Status: **Phase 2 of 8** — foundation, cards, categories & rules, transactions and settings are done. Next: dashboard, SMS ingestion, Telegram bot, import, alerts and hardening. This README is completed in phase 8.

## Stack

Next.js 16 (App Router, TypeScript strict) · PostgreSQL 17 + Drizzle ORM · Tailwind CSS 4 + shadcn/ui · Zod · Vitest · Docker Compose (app, Postgres, Caddy)

## Local development

Requirements: Node 22+, Docker with Compose v2.

```bash
npm install
cp .env.example .env
# Fill in .env:
#   SESSION_SECRET  → openssl rand -base64 48
#   INGEST_TOKEN    → openssl rand -hex 32
#   ADMIN_PASSWORD_HASH → run: npm run hash-password   (paste the printed line)

npm run db:up        # Postgres on 127.0.0.1:5442
npm run dev          # http://localhost:3000
```

On startup the server applies pending migrations and, if the database is empty, seeds default categories, starter categorization rules and your four cards. You can turn this off with `MIGRATE_ON_START` and `SEED_ON_EMPTY`.

| Script                                   | Purpose                                             |
| ---------------------------------------- | --------------------------------------------------- |
| `npm run dev`                            | Dev server                                          |
| `npm test`                               | Unit tests (Vitest)                                 |
| `npm run typecheck` / `npm run lint`     | Static checks                                       |
| `npm run db:generate`                    | Create a migration after editing `src/db/schema.ts` |
| `npm run db:migrate` / `npm run db:seed` | Apply migrations / seed manually                    |
| `npm run db:studio`                      | Browse the database                                 |
| `npm run hash-password`                  | Generate `ADMIN_PASSWORD_HASH`                      |

## Production (quick version)

```bash
cp .env.example .env    # set DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD (openssl rand -hex 24), secrets
docker compose up -d --build
```

Caddy obtains a TLS certificate for `DOMAIN` automatically. Point the domain's DNS A record at the VPS and open ports 80 and 443 first.

To generate the password hash on the server:

```bash
docker compose run --rm --no-deps app node scripts/hash-password.mjs
```

## Project layout

```
src/
  app/(app)/        authenticated pages (dashboard, transactions, …)
  app/login/        login page + server actions
  app/api/          route handlers (health; ingest and Telegram later)
  components/       app shell, shared and shadcn/ui components
  db/               Drizzle schema, client, migrations runner, seed
  lib/              env validation, auth, i18n, logging, rate limiting
  proxy.ts          auth gate + CSRF Origin check
  instrumentation.ts → server/boot.ts (migrations, seed, later: scheduler & bot)
drizzle/            SQL migrations
scripts/            CLI helpers
```
