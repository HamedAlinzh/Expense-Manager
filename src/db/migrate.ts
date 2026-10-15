import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const LOCK_KEY = 727_001; // arbitrary constant shared by every app instance

/**
 * Applies pending migrations from ./drizzle. Holds a Postgres advisory lock on a
 * dedicated single connection so two starting containers can't migrate at once.
 */
export async function runMigrations(databaseUrl: string, migrationsFolder = path.join(process.cwd(), "drizzle")) {
  const client = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await client`select pg_advisory_lock(${LOCK_KEY})`;
    await migrate(drizzle(client), { migrationsFolder });
  } finally {
    await client`select pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
    await client.end({ timeout: 5 });
  }
}
