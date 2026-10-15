import "server-only";
import cron from "node-cron";
import { APP_TZ, addDaysToKey, dayKeyOf, tehranParts, toJalaliParts } from "@/lib/format/time";
import { errorMessage, log } from "@/lib/logger";
import { deliverDue } from "@/server/notify/queue";
import { runRecurringDetection } from "./recurring";
import { runOnce, withLock } from "./runner";
import { sendMonthlySummary, sendWeeklySummary } from "./summaries";

const g = globalThis as unknown as { __schedulerStarted?: boolean };

const safe = (name: string, fn: () => Promise<unknown>) => async () => {
  try {
    await fn();
  } catch (err) {
    log.error("scheduler: job error", { job: name, error: errorMessage(err) });
  }
};

/** The Friday (Tehran) of the current week if it's Friday 09:00 or later, else null. */
function dueWeeklyKey(now: Date): string | null {
  const p = tehranParts(now);
  return p.weekday === 5 && p.hour >= 9 ? dayKeyOf(now) : null;
}

export const jobs = {
  deliver: () => withLock("deliver", () => deliverDue()),
  recurring: (now = new Date()) =>
    runOnce("recurring", `recurring:${dayKeyOf(now)}`, async () => void (await runRecurringDetection(now))),
  weekly: (now = new Date()) => {
    const key = dueWeeklyKey(now);
    return key
      ? runOnce("weekly-summary", `weekly-summary:${key}`, () => sendWeeklySummary(now))
      : Promise.resolve("skipped" as const);
  },
  monthly: (now = new Date()) => {
    const j = toJalaliParts(now);
    // Day 1–3 after 09:00 covers a server that was down on the 1st.
    if (j.jd > 3 || (j.jd === 1 && j.hour < 9)) return Promise.resolve("skipped" as const);
    return runOnce("monthly-summary", `monthly-summary:${j.jy}-${String(j.jm).padStart(2, "0")}`, () =>
      sendMonthlySummary(now),
    );
  },
};

/**
 * In-process scheduler (Tehran time). Every job is idempotent per period (job_runs) or guarded by
 * an advisory lock, so restarts, overlaps or a second instance can't double-send.
 */
export function startScheduler(): void {
  if (g.__schedulerStarted) return;
  g.__schedulerStarted = true;
  const opts = { timezone: APP_TZ, noOverlap: true };
  cron.schedule("*/2 * * * *", safe("deliver", jobs.deliver), opts);
  cron.schedule(
    "30 7 * * *",
    safe("recurring", () => jobs.recurring()),
    opts,
  );
  cron.schedule(
    "0 9 * * 5",
    safe("weekly", () => jobs.weekly()),
    opts,
  );
  cron.schedule(
    "5 9 * * *",
    safe("monthly", () => jobs.monthly()),
    opts,
  );

  // Catch up on anything missed while the server was down (each is a no-op if already done).
  setTimeout(
    safe("catch-up", async () => {
      const now = new Date();
      await jobs.deliver();
      if (tehranParts(now).hour >= 8) await jobs.recurring(now);
      await jobs.weekly(now);
      // Friday's summary can still go out on Saturday if the server was down all Friday.
      const p = tehranParts(now);
      if (p.weekday === 6)
        await runOnce("weekly-summary", `weekly-summary:${addDaysToKey(dayKeyOf(now), -1)}`, () =>
          sendWeeklySummary(new Date(now.getTime() - 86_400_000)),
        );
      await jobs.monthly(now);
    }),
    15_000,
  );
  log.info("scheduler started", { timezone: APP_TZ });
}
