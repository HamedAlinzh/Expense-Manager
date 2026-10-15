import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Enums ───────────────────────────────────────────────────────────────────

export const bankEnum = pgEnum("bank", ["sepah", "mellat", "tejarat", "blu", "other"]);
export const cardTypeEnum = pgEnum("card_type", ["debit", "credit"]);
export const categoryKindEnum = pgEnum("category_kind", ["expense", "income"]);
export const txTypeEnum = pgEnum("tx_type", ["expense", "income", "transfer", "refund"]);
/** `notification` = Android app push notification text forwarded like an SMS. */
export const txSourceEnum = pgEnum("tx_source", ["manual", "csv", "sms", "notification", "telegram"]);
/** Money leaving the card (`out`) or arriving (`in`). Needed for transfers, whose `type` alone is direction-less. */
export const txDirectionEnum = pgEnum("tx_direction", ["out", "in"]);
export const txStatusEnum = pgEnum("tx_status", ["pending_review", "confirmed"]);
export const rawSourceEnum = pgEnum("raw_source", ["sms", "notification", "telegram"]);
export const parseStatusEnum = pgEnum("parse_status", ["parsed", "needs_review", "failed", "ignored"]);
export const ruleFieldEnum = pgEnum("rule_field", ["merchant", "description", "raw_text"]);
export const ruleMatchEnum = pgEnum("rule_match", ["contains", "regex", "equals"]);
export const budgetPeriodEnum = pgEnum("budget_period", ["monthly"]);
export const recurringIntervalEnum = pgEnum("recurring_interval", ["weekly", "monthly", "yearly"]);
export const recurringStatusEnum = pgEnum("recurring_status", ["detected", "confirmed", "dismissed"]);
export const displayUnitEnum = pgEnum("display_unit", ["toman", "thousand_toman", "rial"]);
export const calendarEnum = pgEnum("calendar", ["jalali", "gregorian"]);
export const jobStatusEnum = pgEnum("job_status", ["running", "succeeded", "failed"]);

// Amounts are integer Rial. JS numbers are exact up to 2^53 (≈ 9×10^15 Rial),
// far above any personal balance, and serialize to JSON without BigInt pitfalls.
const rial = (name: string) => bigint(name, { mode: "number" });

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ─── Cards ───────────────────────────────────────────────────────────────────

export const cards = pgTable(
  "cards",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    bank: bankEnum("bank").notNull(),
    color: text("color").notNull(),
    cardType: cardTypeEnum("card_type").notNull().default("debit"),
    /** Names the Telegram bot matches in free text, e.g. ["mellat", "ملت"]. */
    aliases: text("aliases")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Masked card/account fragments seen in SMS (e.g. "1234", "0123456789"). */
    identifierFragments: text("identifier_fragments")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** SMS sender IDs or Android package names this bank uses. */
    smsSenderIds: text("sms_sender_ids")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    lastKnownBalanceRial: rial("last_known_balance_rial"),
    balanceUpdatedAt: timestamp("balance_updated_at", { withTimezone: true }),
    lowBalanceThresholdRial: rial("low_balance_threshold_rial"),
    creditLimitRial: rial("credit_limit_rial"),
    statementDay: smallint("statement_day"),
    dueDay: smallint("due_day"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    check("cards_statement_day_range", sql`${t.statementDay} IS NULL OR ${t.statementDay} BETWEEN 1 AND 31`),
    check("cards_due_day_range", sql`${t.dueDay} IS NULL OR ${t.dueDay} BETWEEN 1 AND 31`),
  ],
);

// ─── Categories & rules ──────────────────────────────────────────────────────

export const categories = pgTable(
  "categories",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    /** lucide-react icon name, e.g. "shopping-cart". */
    icon: text("icon").notNull().default("circle"),
    color: text("color").notNull(),
    parentId: integer("parent_id").references((): AnyPgColumn => categories.id, { onDelete: "set null" }),
    kind: categoryKindEnum("kind").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: boolean("archived").notNull().default(false),
    ...timestamps,
  },
  (t) => [uniqueIndex("categories_kind_name_uq").on(t.kind, t.name)],
);

export const categoryRules = pgTable(
  "category_rules",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    matchField: ruleFieldEnum("match_field").notNull(),
    matchType: ruleMatchEnum("match_type").notNull(),
    pattern: text("pattern").notNull(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    /** Optionally force a transaction type (e.g. salary rule → income). */
    setType: txTypeEnum("set_type"),
    priority: integer("priority").notNull().default(100),
    enabled: boolean("enabled").notNull().default(true),
    ...timestamps,
  },
  (t) => [index("category_rules_priority_idx").on(t.priority)],
);

// ─── Raw messages (SMS, notifications, Telegram text) ────────────────────────

export const rawMessages = pgTable(
  "raw_messages",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    source: rawSourceEnum("source").notNull(),
    sender: text("sender").notNull(),
    /** Null when the body was discarded (OTP / login codes). */
    body: text("body"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    /** sha256(source|sender|body|received_at) — idempotency key for the ingest endpoint. */
    contentHash: text("content_hash").notNull(),
    parseStatus: parseStatusEnum("parse_status").notNull(),
    parserUsed: text("parser_used"),
    /** Parser output snapshot for debugging and re-runs. */
    parseResult: jsonb("parse_result"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("raw_messages_content_hash_uq").on(t.contentHash),
    index("raw_messages_status_idx").on(t.parseStatus),
    index("raw_messages_received_at_idx").on(t.receivedAt),
  ],
);

// ─── Transactions ────────────────────────────────────────────────────────────

export const transactions = pgTable(
  "transactions",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    cardId: integer("card_id").references(() => cards.id, { onDelete: "restrict" }),
    type: txTypeEnum("type").notNull(),
    direction: txDirectionEnum("direction").notNull(),
    /** Always positive; sign comes from `direction`. */
    amountRial: rial("amount_rial").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    description: text("description").notNull().default(""),
    merchant: text("merchant"),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    note: text("note"),
    source: txSourceEnum("source").notNull(),
    status: txStatusEnum("status").notNull().default("confirmed"),
    rawMessageId: integer("raw_message_id").references(() => rawMessages.id, { onDelete: "set null" }),
    balanceAfterRial: rial("balance_after_rial"),
    /** Refund ↔ original, or the other half of a transfer pair. */
    linkedTransactionId: integer("linked_transaction_id").references((): AnyPgColumn => transactions.id, {
      onDelete: "set null",
    }),
    /** Set when a second source (SMS ↔ manual/CSV) was matched to this row instead of duplicating it. */
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    dedupeHash: text("dedupe_hash"),
    /** Parser confidence 0–1 for automatically ingested rows. */
    confidence: real("confidence"),
    ...timestamps,
  },
  (t) => [
    check("transactions_amount_positive", sql`${t.amountRial} > 0`),
    index("transactions_occurred_at_idx").on(t.occurredAt),
    index("transactions_card_occurred_idx").on(t.cardId, t.occurredAt),
    index("transactions_category_idx").on(t.categoryId),
    index("transactions_status_idx").on(t.status),
    index("transactions_dedupe_hash_idx").on(t.dedupeHash),
    index("transactions_raw_message_idx").on(t.rawMessageId),
    index("transactions_tags_gin").using("gin", t.tags),
    // Requires pg_trgm (migration 0001). Queries must use the same expression: see searchExpr in transactions queries.
    index("transactions_search_trgm").using(
      "gin",
      sql`(coalesce(${t.description}, '') || ' ' || coalesce(${t.merchant}, '') || ' ' || coalesce(${t.note}, '')) gin_trgm_ops`,
    ),
  ],
);

/** A transaction split across several categories. When splits exist they replace the parent's category in reports. */
export const transactionSplits = pgTable(
  "transaction_splits",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    transactionId: integer("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    amountRial: rial("amount_rial").notNull(),
    note: text("note"),
  },
  (t) => [
    check("transaction_splits_amount_positive", sql`${t.amountRial} > 0`),
    index("transaction_splits_tx_idx").on(t.transactionId),
  ],
);

// ─── Budgets ─────────────────────────────────────────────────────────────────

export const budgets = pgTable(
  "budgets",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    amountRial: rial("amount_rial").notNull(),
    period: budgetPeriodEnum("period").notNull().default("monthly"),
    /** Jalali month this amount applies from, "YYYY-MM" (e.g. "1405-07"). Keeps history when a budget changes. */
    startsMonth: text("starts_month").notNull(),
    alertThresholds: smallint("alert_thresholds")
      .array()
      .notNull()
      .default(sql`'{80,100}'::smallint[]`),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("budgets_category_month_uq").on(t.categoryId, t.startsMonth),
    check("budgets_amount_positive", sql`${t.amountRial} > 0`),
    check("budgets_starts_month_format", sql`${t.startsMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
  ],
);

// ─── Recurring payments ──────────────────────────────────────────────────────

export const recurringSeries = pgTable(
  "recurring_series",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    merchant: text("merchant").notNull(),
    cardId: integer("card_id").references(() => cards.id, { onDelete: "set null" }),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    typicalAmountRial: rial("typical_amount_rial").notNull(),
    lastAmountRial: rial("last_amount_rial").notNull(),
    interval: recurringIntervalEnum("interval").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    nextExpectedAt: timestamp("next_expected_at", { withTimezone: true }).notNull(),
    occurrences: integer("occurrences").notNull().default(0),
    status: recurringStatusEnum("status").notNull().default("detected"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex("recurring_series_merchant_card_uq").on(t.merchant, t.cardId)],
);

// ─── Notifications & jobs ────────────────────────────────────────────────────

export const notificationsLog = pgTable(
  "notifications_log",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    type: text("type").notNull(),
    /** Unique per alert instance, e.g. "budget:12:1405-07:80". Prevents duplicate sends. */
    dedupeKey: text("dedupe_key").notNull(),
    payload: jsonb("payload"),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("notifications_log_dedupe_key_uq").on(t.dedupeKey)],
);

export const jobRuns = pgTable(
  "job_runs",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    jobName: text("job_name").notNull(),
    /** Unique per scheduled slot, e.g. "weekly-summary:1405-W29". */
    runKey: text("run_key").notNull(),
    status: jobStatusEnum("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
  },
  (t) => [uniqueIndex("job_runs_run_key_uq").on(t.runKey)],
);

// ─── UI persistence ──────────────────────────────────────────────────────────

export const savedViews = pgTable("saved_views", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  filters: jsonb("filters").notNull(),
  ...timestamps,
});

export const importMappings = pgTable(
  "import_mappings",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    cardId: integer("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    mapping: jsonb("mapping").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("import_mappings_card_uq").on(t.cardId)],
);

// ─── Settings (single row, id = 1) ───────────────────────────────────────────

export const settings = pgTable(
  "settings",
  {
    id: smallint("id").primaryKey().default(1),
    displayUnit: displayUnitEnum("display_unit").notNull().default("toman"),
    calendar: calendarEnum("calendar").notNull().default("jalali"),
    defaultCardId: integer("default_card_id").references(() => cards.id, { onDelete: "set null" }),
    /** Window for matching the same transaction from two sources (SMS vs manual/CSV). */
    dedupeWindowMinutes: integer("dedupe_window_minutes").notNull().default(10),
    /** Window for pairing an expense and income between own cards as a transfer. */
    transferWindowMinutes: integer("transfer_window_minutes").notNull().default(5),
    notifyBudgetAlerts: boolean("notify_budget_alerts").notNull().default(true),
    notifyRecurring: boolean("notify_recurring").notNull().default(true),
    notifyAnomalies: boolean("notify_anomalies").notNull().default(true),
    notifyLowBalance: boolean("notify_low_balance").notNull().default(true),
    weeklySummary: boolean("weekly_summary").notNull().default(true),
    monthlySummary: boolean("monthly_summary").notNull().default(true),
    /** Bumped on "log out everywhere"; sessions carrying an older version are rejected. */
    sessionVersion: integer("session_version").notNull().default(1),
    ...timestamps,
  },
  (t) => [check("settings_singleton", sql`${t.id} = 1`)],
);

export type Card = typeof cards.$inferSelect;
export type NewCard = typeof cards.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type RawMessage = typeof rawMessages.$inferSelect;
export type CategoryRule = typeof categoryRules.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type RecurringSeries = typeof recurringSeries.$inferSelect;
export type Settings = typeof settings.$inferSelect;
