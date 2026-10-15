CREATE TYPE "public"."bank" AS ENUM('sepah', 'mellat', 'tejarat', 'blu', 'other');--> statement-breakpoint
CREATE TYPE "public"."budget_period" AS ENUM('monthly');--> statement-breakpoint
CREATE TYPE "public"."calendar" AS ENUM('jalali', 'gregorian');--> statement-breakpoint
CREATE TYPE "public"."card_type" AS ENUM('debit', 'credit');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('expense', 'income');--> statement-breakpoint
CREATE TYPE "public"."display_unit" AS ENUM('toman', 'thousand_toman', 'rial');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."parse_status" AS ENUM('parsed', 'needs_review', 'failed', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."raw_source" AS ENUM('sms', 'notification', 'telegram');--> statement-breakpoint
CREATE TYPE "public"."recurring_interval" AS ENUM('weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."recurring_status" AS ENUM('detected', 'confirmed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."rule_field" AS ENUM('merchant', 'description', 'raw_text');--> statement-breakpoint
CREATE TYPE "public"."rule_match" AS ENUM('contains', 'regex', 'equals');--> statement-breakpoint
CREATE TYPE "public"."tx_source" AS ENUM('manual', 'csv', 'sms', 'notification', 'telegram');--> statement-breakpoint
CREATE TYPE "public"."tx_status" AS ENUM('pending_review', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."tx_type" AS ENUM('expense', 'income', 'transfer', 'refund');--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "budgets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"category_id" integer NOT NULL,
	"amount_rial" bigint NOT NULL,
	"period" "budget_period" DEFAULT 'monthly' NOT NULL,
	"starts_month" text NOT NULL,
	"alert_thresholds" smallint[] DEFAULT '{80,100}'::smallint[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budgets_amount_positive" CHECK ("budgets"."amount_rial" > 0),
	CONSTRAINT "budgets_starts_month_format" CHECK ("budgets"."starts_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')
);
--> statement-breakpoint
CREATE TABLE "cards" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cards_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"bank" "bank" NOT NULL,
	"color" text NOT NULL,
	"card_type" "card_type" DEFAULT 'debit' NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"identifier_fragments" text[] DEFAULT '{}'::text[] NOT NULL,
	"sms_sender_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_known_balance_rial" bigint,
	"balance_updated_at" timestamp with time zone,
	"low_balance_threshold_rial" bigint,
	"credit_limit_rial" bigint,
	"statement_day" smallint,
	"due_day" smallint,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cards_statement_day_range" CHECK ("cards"."statement_day" IS NULL OR "cards"."statement_day" BETWEEN 1 AND 31),
	CONSTRAINT "cards_due_day_range" CHECK ("cards"."due_day" IS NULL OR "cards"."due_day" BETWEEN 1 AND 31)
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "categories_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"icon" text DEFAULT 'circle' NOT NULL,
	"color" text NOT NULL,
	"parent_id" integer,
	"kind" "category_kind" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "category_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "category_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"match_field" "rule_field" NOT NULL,
	"match_type" "rule_match" NOT NULL,
	"pattern" text NOT NULL,
	"category_id" integer NOT NULL,
	"set_type" "tx_type",
	"priority" integer DEFAULT 100 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_mappings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "import_mappings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"card_id" integer NOT NULL,
	"mapping" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "job_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"job_name" text NOT NULL,
	"run_key" text NOT NULL,
	"status" "job_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "notifications_log" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "notifications_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"type" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_messages" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "raw_messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" "raw_source" NOT NULL,
	"sender" text NOT NULL,
	"body" text,
	"received_at" timestamp with time zone NOT NULL,
	"content_hash" text NOT NULL,
	"parse_status" "parse_status" NOT NULL,
	"parser_used" text,
	"parse_result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_series" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "recurring_series_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"merchant" text NOT NULL,
	"card_id" integer,
	"category_id" integer,
	"typical_amount_rial" bigint NOT NULL,
	"last_amount_rial" bigint NOT NULL,
	"interval" "recurring_interval" NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"next_expected_at" timestamp with time zone NOT NULL,
	"occurrences" integer DEFAULT 0 NOT NULL,
	"status" "recurring_status" DEFAULT 'detected' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "saved_views_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"display_unit" "display_unit" DEFAULT 'toman' NOT NULL,
	"calendar" "calendar" DEFAULT 'jalali' NOT NULL,
	"default_card_id" integer,
	"dedupe_window_minutes" integer DEFAULT 10 NOT NULL,
	"transfer_window_minutes" integer DEFAULT 5 NOT NULL,
	"notify_budget_alerts" boolean DEFAULT true NOT NULL,
	"notify_recurring" boolean DEFAULT true NOT NULL,
	"notify_anomalies" boolean DEFAULT true NOT NULL,
	"notify_low_balance" boolean DEFAULT true NOT NULL,
	"weekly_summary" boolean DEFAULT true NOT NULL,
	"monthly_summary" boolean DEFAULT true NOT NULL,
	"session_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "transaction_splits" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transaction_splits_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"transaction_id" integer NOT NULL,
	"category_id" integer,
	"amount_rial" bigint NOT NULL,
	"note" text,
	CONSTRAINT "transaction_splits_amount_positive" CHECK ("transaction_splits"."amount_rial" > 0)
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "transactions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"card_id" integer,
	"type" "tx_type" NOT NULL,
	"amount_rial" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"merchant" text,
	"category_id" integer,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"note" text,
	"source" "tx_source" NOT NULL,
	"status" "tx_status" DEFAULT 'confirmed' NOT NULL,
	"raw_message_id" integer,
	"balance_after_rial" bigint,
	"linked_transaction_id" integer,
	"reconciled_at" timestamp with time zone,
	"dedupe_hash" text,
	"confidence" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount_rial" > 0)
);
--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_rules" ADD CONSTRAINT "category_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_mappings" ADD CONSTRAINT "import_mappings_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_default_card_id_cards_id_fk" FOREIGN KEY ("default_card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_raw_message_id_raw_messages_id_fk" FOREIGN KEY ("raw_message_id") REFERENCES "public"."raw_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_linked_transaction_id_transactions_id_fk" FOREIGN KEY ("linked_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_category_month_uq" ON "budgets" USING btree ("category_id","starts_month");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_kind_name_uq" ON "categories" USING btree ("kind","name");--> statement-breakpoint
CREATE INDEX "category_rules_priority_idx" ON "category_rules" USING btree ("priority");--> statement-breakpoint
CREATE UNIQUE INDEX "import_mappings_card_uq" ON "import_mappings" USING btree ("card_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_run_key_uq" ON "job_runs" USING btree ("run_key");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_log_dedupe_key_uq" ON "notifications_log" USING btree ("dedupe_key");--> statement-breakpoint
CREATE UNIQUE INDEX "raw_messages_content_hash_uq" ON "raw_messages" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "raw_messages_status_idx" ON "raw_messages" USING btree ("parse_status");--> statement-breakpoint
CREATE INDEX "raw_messages_received_at_idx" ON "raw_messages" USING btree ("received_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_series_merchant_card_uq" ON "recurring_series" USING btree ("merchant","card_id");--> statement-breakpoint
CREATE INDEX "transaction_splits_tx_idx" ON "transaction_splits" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transactions_occurred_at_idx" ON "transactions" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "transactions_card_occurred_idx" ON "transactions" USING btree ("card_id","occurred_at");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transactions_status_idx" ON "transactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "transactions_dedupe_hash_idx" ON "transactions" USING btree ("dedupe_hash");--> statement-breakpoint
CREATE INDEX "transactions_raw_message_idx" ON "transactions" USING btree ("raw_message_id");