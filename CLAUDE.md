# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Self-hosted, single-user expense manager for Iranian bank cards (Sepah, Mellat, Tejarat, Blu): bank SMS/notifications
are forwarded from Android (MacroDroid) and parsed into transactions, a Telegram bot handles quick entries and alerts.
Next.js 16 App Router + TypeScript strict, PostgreSQL 17 + Drizzle, Tailwind 4 + shadcn/ui (radix-nova style), grammY,
node-cron, Vitest. `README.md` has the user-facing docs (deployment, MacroDroid, backups).

## Next.js 16 — read the bundled docs first

This is NOT the Next.js in your training data. Before writing Next-specific code, read the relevant guide in
`node_modules/next/dist/docs/` (see `AGENTS.md`; `next dev` re-adds that block — commit it as-is). Notably here:
`src/proxy.ts` replaces middleware; request APIs (`cookies()`, `headers()`, `params`, `searchParams`) are async;
`cacheComponents` is deliberately **off** (every page is per-user/dynamic); the root layout awaits `headers()` so every
page renders per request and receives the CSP nonce.

## Commands

```bash
npm run db:up                 # dev Postgres in Docker on 127.0.0.1:5442 (docker-compose.dev.yml)
npm run dev                   # http://localhost:3000 — boot applies migrations + seeds an empty DB
npm test                      # all Vitest tests (includes every SMS fixture)
npx vitest run src/lib/ingest/fixtures.test.ts -t "tejarat"   # single file / test-name filter
npm run typecheck             # next typegen && tsc --noEmit (typegen provides PageProps/LayoutProps)
npm run lint                  # eslint (React Compiler rules: no impure calls like Date.now() in render, no setState in effects)
npm run format                # prettier (printWidth 120; src/components/ui is excluded)
npm run build                 # production build (output: standalone)
npm run db:generate -- --name <name>   # migration after editing src/db/schema.ts (drizzle/ folder)
npm run db:demo [-- --remove] # ~4 Jalali months of #demo transactions + demo budgets (dev only)
npm run parse-sms -- fixtures/sms/sepah/deposit.txt   # how the parser reads a message, no DB
```

Server modules import `server-only`; to run them from an ad-hoc script use
`node --env-file=.env --conditions=react-server --import tsx script.mts` (`.mts` for top-level await).

Production: `docker compose up -d --build` (app + postgres + caddy). Migrations run on start via
`src/instrumentation.ts → src/server/boot.ts`, which also starts the scheduler and the Telegram bot.

## Core conventions (cross-cutting)

- **Money is integer Rial** (`bigint` columns with `mode: "number"`, exact below 2^53). Never use floats for money.
  Parse user input with `parseAmountToRial(str, unit)` (decimal-string math; Persian/Arabic digits, `,` `٬` `،`
  separators). Display units: `toman` (default) / `thousand_toman` / `rial` from settings via `PrefsProvider` and
  `<Money>` / `useMoneyFormatter()`. Telegram quick entries are in **thousand Toman**. `amount_rial` is always
  positive; sign comes from `direction` (`in`/`out`). Transfers between own cards are linked pairs of `type: "transfer"`
  rows and are excluded from spending/income totals.
- **Time is Asia/Tehran; months are Jalali.** Jalali conversion is our own pure implementation
  (`src/lib/format/jalali.ts`, cross-checked against ICU in tests) — don't depend on the process timezone or
  date-fns-jalali. `src/lib/format/time.ts` has `jalaliToUtc`, `jalaliMonthRange` (`[start, end)` instants),
  `DayKey` ("2026-10-15", Gregorian Tehran-local day, used in URLs) and `MonthKey` ("1405-07"). Budgets are versioned
  by `starts_month`: the latest row ≤ month wins; an inactive latest row means "no budget from that month on".
- **Persian/RTL text**: render user/SMS text with `dir="auto"`; bank SMS go through `RawMessage`/`BidiText`
  (`src/components/common/bidi-text.tsx`) so masked card numbers and dates keep their order inside RTL lines. Keep
  numbers and Persian text in separate elements in mixed layouts. Normalize text for matching with `normalizeText`
  (digits, ي/ك → ی/ک, ZWNJ).

## Architecture

- `src/lib/**` — pure, unit-tested logic (money, dates, parsers, rules engine, matching, recurring/anomaly detection,
  quick-entry parsing, schemas). No DB access.
- `src/server/**` — `server-only`: `queries/` (reads), `services/` (writes shared by web and bot), `ingest/`,
  `telegram/`, `alerts/`, `notify/`, `jobs/`, `settings.ts`.
- `src/app/(app)/**/actions.ts` — Server Actions built with `defineAction(zodSchema, handler)`
  (`src/server/action-utils.ts`): it checks the session, validates input, maps `UserError` to a user-facing message,
  and revalidates the layout. Throw `UserError` (`src/server/errors.ts`) for messages safe to show. Business logic that
  the bot also needs lives in `src/server/services/transactions.ts`, not in the action.
- Client components get reference data (cards, categories, default card) from `AppDataProvider` and display prefs from
  `PrefsProvider`, both loaded once in `src/app/(app)/layout.tsx`. Transactions page filters live in the URL
  (`parseFilters`/`filtersToParams` in `src/lib/schemas/transaction.ts`); `buildWhere` is reused by the CSV export.

### Ingestion pipeline (`src/server/ingest/pipeline.ts`)

`ingestMessage` is the single entry for `POST /api/ingest/sms` (sms/notification) and Telegram forwards:
idempotency by content hash → OTP discard (body never stored; OTP hash excludes the body) → sender allowlist from
`cards.sms_sender_ids` (unknown senders stored only if bank-like) → Luhn-valid card numbers masked →
`parseMessage` (bank profiles + generic) → optional Claude fallback (`ai-parser.ts`, always `pending_review`) →
`matchCard` (sender + identifier; a sole candidate card *learns* new identifiers) → balance continuity check
(prev ± amount = new balance confirms or flips direction) → dedupe/reconcile against existing entries → rules →
insert → transfer pairing → card balance update → `afterTransactionWrite`. Confidence ≥ 0.9 with a matched card is
auto-confirmed; everything else lands in the Inbox. `processRawMessage` re-runs parsing for stored messages.

Parsers are data-driven: `src/lib/ingest/parsers/profiles.ts` (per-bank markers, sender hints, ordered keywords with
optional `ambiguous` flag) + shared `extract.ts` (amounts, balance, identifiers, every date format seen in real SMS).
To support a new format, add a fixture under `fixtures/sms/<bank>/` (format in `fixtures/sms/README.md`; it runs as a
test) and adjust the profile. Fixtures must be anonymized — never commit real account/card numbers.

### Telegram, alerts, notifications, jobs

- Bot: `src/server/telegram/bot.ts` (handlers; only `TELEGRAM_ALLOWED_USER_IDS` in private chats), `views.ts` (message
  text + inline keyboards; callback data like `sc:<txId>:<catId>`), `runtime.ts` (singleton, polling vs webhook
  registration, `notifyOwner`). Only one process may poll a bot token; polling deletes a registered webhook.
- `afterTransactionWrite(txId)` (`src/server/alerts/hooks.ts`) lazily imports the alert checks to avoid an import
  cycle (services → alerts → notify → telegram → services). Checks: budget thresholds, unusual expense, low balance.
- All notifications go through `enqueueNotification` (`src/server/notify/queue.ts`): `notifications_log.dedupe_key`
  is unique (an alert is created at most once), quiet hours 23:00–08:00 delay delivery, retries, and the table doubles
  as the in-app feed. `NOTIFY_DRY_RUN=true` logs instead of sending.
- Scheduler (`src/server/jobs/scheduler.ts`, Tehran cron): delivery every 2 min, backup 03:30 (`pg_dump`, only
  available in the Docker image), recurring detection 07:30, weekly summary Fri 09:00, monthly summary on Jalali day 1.
  Jobs are idempotent per period via `runOnce` (claim row in `job_runs`) or `withLock` (advisory lock), and catch up on
  startup.

### Auth & security

`src/proxy.ts`: session gate (JWT via `jose`, `src/lib/auth/token.ts`; revocation via `settings.session_version`
checked in `getSession`), CSRF (non-GET requests must carry a same-host `Origin`), and a per-request CSP nonce.
`/api/ingest/*`, `/api/telegram/*` and `/api/health` bypass it and authenticate themselves (constant-time
`tokenMatches`). New authenticated route handlers must also call `getSession()` themselves. Logs must not contain SMS
text or amounts above `debug` level.

## Build history (one commit per phase)

1. **Foundation** — Drizzle schema + auto-migrate/seed on boot, argon2id login (`ADMIN_PASSWORD_HASH` is stored
   `b64:`-wrapped so `$` survives Compose/dotenv), proxy auth gate + CSRF, Docker Compose (app/postgres/caddy).
2. **Ledger** — money/Jalali utilities, cards, categories & rules engine, transactions page (URL filters, splits,
   bulk actions, drawer), quick add (`N` key / mobile FAB), settings, JSON export. Added `direction` column + pg_trgm
   search index.
3. **Dashboard** — Recharts views per Jalali month; palette validated for color-blindness (income aqua / expense
   orange); every chart has a table view; `npm run db:demo` for realistic data.
4. **SMS ingestion** — `/api/ingest/sms`, OTP filter, per-bank parsers built from the user's real Mellat/Tejarat/Sepah
   SMS (anonymized into `fixtures/sms/`), card identifier learning, balance continuity check, Inbox, AI fallback.
   Tejarat "انتقال به" = money in, "انتقال از" = money out (confirmed by the user).
5. **Telegram bot** — grammY quick entries in thousand Toman, forwarded SMS, commands, inline buttons; transaction
   writes moved into `src/server/services/` so web actions and the bot share them.
6. **CSV/XLSX import** — skipped by the user (they don't use statement files); the Import page was removed.
7. **Planning** — budgets (versioned by Jalali month), alerts with quiet hours and dedupe, recurring detection,
   weekly/monthly summaries, Insights page, CSV export, in-process scheduler.
8. **Hardening** — CSP with per-request nonce, security review, nightly `pg_dump` backups to a named volume (newest
   14), JSON restore in Settings, tested `pg_restore` procedure, full README.

Not yet done: VPS deployment (Telegram switches from `polling` to `webhook` there — local `.env` must then use
`TELEGRAM_MODE=off`), and real Blu SMS samples (Blu uses the generic parser until one arrives).

## Gotchas

- Raw `sql` templates with `db().execute(...)` don't serialize `Date` params — pass `date.toISOString()` with a
  `::timestamptz` cast. An expression used in both SELECT and GROUP BY must be identical: bound params differ, so
  constants (like the timezone) are inlined with `sql.raw`.
- postgres.js returns `count(*)`/`sum()` as strings — cast (`::int`) or `Number(...)`.
- React events bubble through portals: row click handlers check `e.currentTarget.contains(e.target)` so popovers
  inside table rows don't trigger them.
- Chart series colors are fixed, CVD-validated tokens in `src/components/dashboard/chart-theme.ts` (income aqua,
  expense orange); text keeps neutral text colors.
- Seeded card sender IDs: Mellat `Bank Mellat`, Tejarat `TejaratBank`, Sepah `986715000`; Blu is a placeholder until a
  real message arrives (Inbox → Ignored → "Add sender to card").
