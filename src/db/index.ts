import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __pg?: postgres.Sql; __db?: DB };

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

/** Shared postgres.js client. Cached on globalThis so dev hot reloads don't leak pools. */
export function sql(): postgres.Sql {
  if (!globalForDb.__pg) {
    globalForDb.__pg = postgres(connectionString(), {
      max: 10,
      idle_timeout: 30,
      // int8 arrives as a string; Drizzle's bigint `mode: "number"` converts it (exact below 2^53).
      connection: { TimeZone: "UTC" },
      onnotice: () => {},
    });
  }
  return globalForDb.__pg;
}

export function db(): DB {
  if (!globalForDb.__db) {
    globalForDb.__db = drizzle(sql(), { schema });
  }
  return globalForDb.__db;
}

export { schema };
