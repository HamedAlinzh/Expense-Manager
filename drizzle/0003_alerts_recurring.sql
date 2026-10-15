CREATE TYPE "public"."notification_status" AS ENUM('queued', 'sent', 'failed', 'skipped');--> statement-breakpoint
DROP INDEX "recurring_series_merchant_card_uq";--> statement-breakpoint
ALTER TABLE "notifications_log" ALTER COLUMN "sent_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "notifications_log" ALTER COLUMN "sent_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications_log" ADD COLUMN "status" "notification_status" DEFAULT 'queued' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications_log" ADD COLUMN "scheduled_for" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications_log" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications_log" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "notifications_log" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD COLUMN "key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD COLUMN "last_transaction_id" integer;--> statement-breakpoint
ALTER TABLE "recurring_series" ADD CONSTRAINT "recurring_series_last_transaction_id_transactions_id_fk" FOREIGN KEY ("last_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_log_queue_idx" ON "notifications_log" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "notifications_log_type_created_idx" ON "notifications_log" USING btree ("type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_series_key_uq" ON "recurring_series" USING btree ("key");