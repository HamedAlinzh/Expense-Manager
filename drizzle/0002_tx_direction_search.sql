CREATE TYPE "public"."tx_direction" AS ENUM('out', 'in');--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "direction" "tx_direction" NOT NULL;--> statement-breakpoint
CREATE INDEX "transactions_tags_gin" ON "transactions" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "transactions_search_trgm" ON "transactions" USING gin ((coalesce("description", '') || ' ' || coalesce("merchant", '') || ' ' || coalesce("note", '')) gin_trgm_ops);