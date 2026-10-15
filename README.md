# Expense Manager

A self-hosted, single-user expense manager for Iranian bank cards (Sepah, Mellat, Tejarat, Blu). Transactions arrive from forwarded bank SMS and app notifications, and from a Telegram bot.

> Status: **Phase 7 of 8** (phase 6, CSV/XLSX import, was skipped) — everything except final hardening is done: cards, categories & rules, transactions, dashboard, SMS/notification ingestion, Telegram bot, budgets, alerts, recurring payments, insights and scheduled summaries. Next: hardening, backups and the final README. This README is completed in phase 8.

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

| Script                                   | Purpose                                              |
| ---------------------------------------- | ---------------------------------------------------- |
| `npm run dev`                            | Dev server                                           |
| `npm test`                               | Unit tests (Vitest)                                  |
| `npm run typecheck` / `npm run lint`     | Static checks                                        |
| `npm run db:generate`                    | Create a migration after editing `src/db/schema.ts`  |
| `npm run db:migrate` / `npm run db:seed` | Apply migrations / seed manually                     |
| `npm run db:studio`                      | Browse the database                                  |
| `npm run hash-password`                  | Generate `ADMIN_PASSWORD_HASH`                       |
| `npm run db:demo` (`-- --remove`)        | Add (or remove) ~4 months of `#demo` data — dev only |
| `npm run parse-sms -- file.txt`          | Show how the parser reads a message (no database)    |

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

## Bank SMS & notification forwarding (MacroDroid)

Your phone forwards bank messages to `POST /api/ingest/sms`; the app parses them, matches the card,
categorizes, and either confirms the transaction or puts it in the **Inbox** for review.

### What the endpoint does

1. Rejects requests without the right `X-Ingest-Token` (constant-time check; rate limited).
2. Stores each message once (same sender + text + time = duplicate, safe to retry).
3. **Discards one-time passwords** (رمز پویا, کد تایید, OTP, …) without storing their text.
4. Ignores senders not listed on any card. The text of an ignored message is kept only when it
   looks like a bank message, so you can link the sender with one click in Inbox → Ignored.
5. Masks full 16-digit card numbers to the last four digits.
6. Parses with the bank's profile (Sepah, Mellat, Tejarat, Blu) or the generic parser, then — only if
   `AI_PARSER_ENABLED=true` and nothing else worked — with Claude. AI results always go to review.
7. Matches the card by sender and account/card number. The first message from a card **teaches it**
   its account/card number; you never have to type it.
8. Checks the balance: previous balance ± amount = new balance confirms (or corrects) the direction.
9. Links instead of duplicating when the same money was already entered manually or imported.
10. Pairs an expense on one of your cards with an equal income on another (within the transfer
    window, Settings → Matching) as a transfer between your own cards.

Messages with confidence ≥ 90% and a matched card are confirmed automatically; the rest wait in the Inbox.

### Request format

Form-encoded (recommended — handles multi-line SMS safely) or JSON:

| Field         | Required | Example                                                                   |
| ------------- | -------- | ------------------------------------------------------------------------- |
| `sender`      | yes      | `TejaratBank`, `Bank Mellat`, `986715000`, or an app package name         |
| `body`        | yes      | the full message text                                                     |
| `received_at` | no       | ISO 8601 or epoch seconds/ms; defaults to the time the server receives it |
| `source`      | no       | `sms` (default) or `notification`                                         |

```bash
curl -X POST https://YOUR_DOMAIN/api/ingest/sms \
  -H "X-Ingest-Token: $INGEST_TOKEN" \
  --data-urlencode "sender=TejaratBank" \
  --data-urlencode $'body=*بانک تجارت*\nحساب: 0112233445566\nبرداشت: 80,000 ریال\nمانده: 1,388,600 ریال\n1405/07/23\n14:27'
# → {"status":"created","raw_message_id":1,"transaction_id":42,"review":false,"transfer":false}
```

`status` is one of `created`, `matched` (linked to an existing entry), `duplicate`, `ignored`,
`needs_review` (saved to the Inbox unparsed) or `failed`.

### MacroDroid setup (Android)

Menu names differ slightly between MacroDroid versions; the idea is always _trigger → HTTP request_.

1. Install **MacroDroid** and allow it to read SMS (and notifications, for Blu). Exclude it from
   battery optimisation so Android doesn't stop it in the background.
2. **Add Macro → Trigger → Phone/Messaging → SMS Received.** Choose _Incoming from: specific number_
   and enter each bank sender exactly as your phone shows it: `Bank Mellat`, `TejaratBank`,
   `986715000` (and Blu's sender once its first SMS arrives). Content: _Any_. Forwarding only these
   senders keeps your personal messages on your phone.
3. **Action → Connectivity → HTTP Request:**
   - Method: `POST`, URL: `https://YOUR_DOMAIN/api/ingest/sms`
   - Header: `X-Ingest-Token` = the `INGEST_TOKEN` value from your server's `.env`
   - Body / content type: **form data (application/x-www-form-urlencoded)** with
     `sender` = the _SMS sender/number_ magic text, `body` = the _SMS message_ magic text,
     `source` = `sms`
   - Enable "retry on failure"/"queue when offline" if your version offers it.
4. **Blu (app notifications):** add a second macro with trigger **Applications → Notification
   Received → Blu**, and the same HTTP action with `sender` = the app name/package magic text,
   `body` = the notification text magic text and `source` = `notification`. Then, on the Cards page,
   add that sender to the Blu card — or just open Inbox → Ignored after the first one arrives and
   click **Add sender to card → Blu**.
5. Test: send yourself a small transaction, then check **Inbox** or **Transactions**. On the server,
   `docker compose logs app | grep ingest` shows each message's outcome (never its text or amount).

If the phone was offline, the bank's SMS isn't lost: forward it later (or paste it to the Telegram
bot in phase 5). Duplicates are recognised, so re-sending is always safe.

### Tuning the parsers

Real samples live in `fixtures/sms/<bank>/` and run as tests — see
[fixtures/sms/README.md](fixtures/sms/README.md). Bank keywords are data in
`src/lib/ingest/parsers/profiles.ts`. Inbox → **Test a message** shows how any text would be read
without saving it, and **Re-parse all** re-runs unparsed messages after you change cards or parsers.

## Telegram bot

### Create the bot and find your user ID

1. In Telegram, open **@BotFather** → `/newbot` → pick a name and a username ending in `bot`.
   BotFather replies with the token → `TELEGRAM_BOT_TOKEN`.
2. Find your numeric user ID: message **@userinfobot** (or @RawDataBot) and copy the `id`
   → `TELEGRAM_ALLOWED_USER_IDS` (comma-separate several IDs). Everyone else is silently ignored,
   and the bot never answers in groups.
3. If a token is ever exposed, send `/revoke` to BotFather, pick the bot, and put the new token in `.env`.

### Polling (local development) vs webhook (production)

| `TELEGRAM_MODE` | How it works                                                                                                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `polling`       | The server long-polls Telegram. Works anywhere Telegram's API is reachable — no public URL needed.                                                                                                                |
| `webhook`       | On start the server registers `APP_URL/api/telegram/webhook` with Telegram, protected by `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 32`; letters, digits, `_` and `-` only). Requires the public HTTPS domain. |
| `off`           | Bot disabled.                                                                                                                                                                                                     |

Switching from webhook to polling removes the webhook automatically. Only one server may poll a
bot at a time — stop local polling before deploying in webhook mode with the same token.

### Using it

| You send                       | Result                                                                |
| ------------------------------ | --------------------------------------------------------------------- |
| `50 lunch`                     | 50,000 T expense on the default card (Settings → Telegram bot)        |
| `50 ناهار ملت`                 | …on Mellat — card names match English or Persian aliases (Cards page) |
| `۱۲۰ سوپرمارکت بلو`            | Persian/Arabic digits work                                            |
| `+3000 salary sepah`           | income of 3,000,000 T                                                 |
| `12.5 taxi tejarat #work`      | 12,500 T, tagged `work`                                               |
| a pasted or forwarded bank SMS | read by the same pipeline as the SMS endpoint (OTPs discarded)        |

Amounts are in **thousand Toman**. The reply shows the saved transaction with buttons to change
category or card, or delete it. After a category change the bot offers to create a rule
("Always 'snapp' → Transport?").

Commands: `/today` `/week` (since Saturday) `/month` (Jalali) `/budget` `/inbox` `/cards` `/last`
`/undo` `/help`.

## Budgets, alerts and insights

### Budgets

Set a monthly limit per expense category on **Budgets** (subcategories count toward their parent).
A budget carries over every Jalali month until you change it; changing or removing it creates a
new version from that month on, so past months keep their history (last 6 months shown).

### Telegram alerts

All alerts go to the allowed Telegram users and also appear on **Insights → Summaries & alerts**.
Each kind can be switched off under **Settings → Notifications**.

| Alert             | When                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------- |
| Budget            | A category passes its thresholds (default 80% and 100%) — once per threshold per month        |
| Unusual expense   | ≥ 3× the typical amount for that merchant (5+ past charges) or category (8+), and ≥ 200,000 T |
| Low balance       | A card's latest SMS balance is under the card's threshold (Cards page) — at most once a day   |
| Recurring price   | A recurring charge costs ≥ 5% more than usual                                                 |
| Recurring missing | A confirmed recurring charge is overdue (2 days weekly, 5 days monthly, 14 days yearly)       |
| Weekly summary    | Fridays 09:00 — the previous 7 days                                                           |
| Monthly summary   | 1st of each Jalali month, 09:00 — the month that ended                                        |

Alerts created during **quiet hours (23:00–08:00 Tehran)** are delivered at 08:00. Every alert has a
unique key, so restarts and retries never send it twice.
Set `NOTIFY_DRY_RUN=true` to log notifications instead of sending them (handy while developing).

### Recurring payments

Every morning (07:30) the app looks for same-merchant expenses at similar amounts (±20%) and
regular intervals (weekly, monthly, yearly; 3+ charges, 2 for yearly). **Recurring** lists them
with typical amount, next expected date, yearly cost and price changes; confirm the real ones
(only confirmed series get "missing charge" alerts) and dismiss the rest. **Scan now** runs it on demand.

### Insights & export

**Insights** shows month-over-month changes per category, top merchants, unusual and largest
expenses, income by source, the Jalali year month by month, and the alert feed.
**Export CSV** (Insights, or Transactions with the current filters) downloads UTF-8 CSV that opens
correctly in Excel. **Settings → Download backup** exports everything as JSON.

### Scheduler

Jobs run inside the app container (node-cron, Asia/Tehran): delivery of queued notifications every
2 minutes, recurring detection daily, weekly and monthly summaries. Each run is claimed in the
`job_runs` table (or under a Postgres advisory lock), so overlaps and restarts are safe; on startup
the app catches up on anything missed while it was down.

## Project layout

```
src/
  app/(app)/        authenticated pages (dashboard, transactions, …)
  app/login/        login page + server actions
  app/api/          route handlers (health, SMS ingest, Telegram webhook, export)
  components/       app shell, shared and shadcn/ui components
  db/               Drizzle schema, client, migrations runner, seed
  lib/              env, auth, i18n, logging, rate limiting, money/date utils,
                    ingest/ (normalize, OTP filter, parsers, matching)
  server/ingest/    ingestion pipeline + optional AI parser
  server/services/  transaction operations shared by web actions and the bot
  server/telegram/  grammY bot (handlers, views, polling/webhook runtime)
  server/alerts/    budget / unusual-expense / low-balance checks after each transaction
  server/jobs/      scheduler, recurring detection, weekly & monthly summaries
  server/notify/    notification queue (quiet hours, dedupe, retries)
  proxy.ts          auth gate + CSRF Origin check
  instrumentation.ts → server/boot.ts (migrations, seed, later: scheduler & bot)
drizzle/            SQL migrations
scripts/            CLI helpers
fixtures/sms/       real (anonymized) bank messages used as parser tests
```
