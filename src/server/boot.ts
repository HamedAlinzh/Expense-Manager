import { db } from "@/db";
import { runMigrations } from "@/db/migrate";
import { seedIfEmpty } from "@/db/seed";
import { env } from "@/lib/env";
import { errorMessage, log } from "@/lib/logger";
import { startTelegram } from "@/server/telegram/runtime";

/** Runs once per server start (from instrumentation.ts), before requests are served. */
export async function boot() {
  const e = env();
  if (e.MIGRATE_ON_START) {
    try {
      await runMigrations(e.DATABASE_URL);
      log.info("migrations applied");
    } catch (err) {
      log.error("migrations failed", { error: errorMessage(err) });
      throw err;
    }
  }
  if (e.SEED_ON_EMPTY) {
    const seeded = await seedIfEmpty(db());
    if (seeded.categories || seeded.cards) log.info("seeded defaults", seeded);
  }
  // Not awaited: a slow or unreachable Telegram API must never block the web app from starting.
  void startTelegram().catch((err) => log.error("telegram: start failed", { error: errorMessage(err) }));
}
