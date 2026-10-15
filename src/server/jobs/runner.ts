import "server-only";
import { and, eq } from "drizzle-orm";
import { db, sql } from "@/db";
import { jobRuns } from "@/db/schema";
import { errorMessage, log } from "@/lib/logger";

/**
 * Runs `fn` at most once per `runKey` (e.g. "weekly-summary:2026-10-16"), across restarts and
 * concurrent instances: the unique job_runs row is the claim. A failed run releases its claim so
 * a later trigger can retry.
 */
export async function runOnce(
  jobName: string,
  runKey: string,
  fn: () => Promise<void>,
): Promise<"ran" | "skipped" | "failed"> {
  const [claim] = await db()
    .insert(jobRuns)
    .values({ jobName, runKey })
    .onConflictDoNothing({ target: jobRuns.runKey })
    .returning({ id: jobRuns.id });
  if (!claim) return "skipped";
  try {
    await fn();
    await db().update(jobRuns).set({ status: "succeeded", finishedAt: new Date() }).where(eq(jobRuns.id, claim.id));
    log.info("job succeeded", { job: jobName, runKey });
    return "ran";
  } catch (err) {
    log.error("job failed", { job: jobName, runKey, error: errorMessage(err) });
    await db()
      .delete(jobRuns)
      .where(and(eq(jobRuns.id, claim.id), eq(jobRuns.status, "running")));
    return "failed";
  }
}

const LOCKS: Record<string, number> = { deliver: 727_101, recurring: 727_102 };

/** Runs `fn` only if no other process holds the named Postgres advisory lock (for frequent jobs). */
export async function withLock<T>(name: keyof typeof LOCKS, fn: () => Promise<T>): Promise<T | null> {
  const conn = await sql().reserve();
  try {
    const [row] = await conn<{ locked: boolean }[]>`select pg_try_advisory_lock(${LOCKS[name]!}) as locked`;
    if (!row?.locked) return null;
    try {
      return await fn();
    } finally {
      await conn`select pg_advisory_unlock(${LOCKS[name]!})`;
    }
  } finally {
    conn.release();
  }
}
