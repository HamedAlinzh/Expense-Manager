import "server-only";
import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { notificationsLog } from "@/db/schema";
import { env } from "@/lib/env";
import { deliveryTime } from "@/lib/insights/alerts";
import { errorMessage, log } from "@/lib/logger";
import { getBot, notifyOwner } from "@/server/telegram/runtime";

const MAX_ATTEMPTS = 5;

export type NotificationInput = {
  type: string;
  /** Unique per alert instance; a second enqueue with the same key is a no-op. */
  dedupeKey: string;
  html: string;
  text: string;
  data?: Record<string, unknown>;
  /** Respect quiet hours (default). Summaries are scheduled for the morning anyway. */
  quietHours?: boolean;
};

/** Records a notification once and delivers it now, or after quiet hours. Returns false if it already existed. */
export async function enqueueNotification(n: NotificationInput, now = new Date()): Promise<boolean> {
  const [row] = await db()
    .insert(notificationsLog)
    .values({
      type: n.type,
      dedupeKey: n.dedupeKey,
      payload: { html: n.html, text: n.text, ...n.data },
      scheduledFor: n.quietHours === false ? now : deliveryTime(now),
    })
    .onConflictDoNothing({ target: notificationsLog.dedupeKey })
    .returning({ id: notificationsLog.id, scheduledFor: notificationsLog.scheduledFor });
  if (!row) return false;
  log.info("notification queued", { id: row.id, type: n.type });
  if (row.scheduledFor.getTime() <= now.getTime()) await deliver(row.id);
  return true;
}

async function deliver(id: number): Promise<void> {
  const [n] = await db()
    .select()
    .from(notificationsLog)
    .where(and(eq(notificationsLog.id, id), eq(notificationsLog.status, "queued")));
  if (!n) return;
  const html = (n.payload as { html?: string } | null)?.html ?? "";
  if (env().NOTIFY_DRY_RUN) {
    log.info("notification (dry run)", { id, type: n.type });
    log.debug("notification (dry run) text", { text: (n.payload as { text?: string } | null)?.text });
    await db()
      .update(notificationsLog)
      .set({ status: "sent", sentAt: new Date(), error: "dry_run" })
      .where(eq(notificationsLog.id, id));
    return;
  }
  if (!getBot()) {
    await db()
      .update(notificationsLog)
      .set({ status: "skipped", error: "telegram not configured" })
      .where(eq(notificationsLog.id, id));
    return;
  }
  try {
    const ok = await notifyOwner(html);
    if (!ok) throw new Error("telegram send failed");
    await db()
      .update(notificationsLog)
      .set({ status: "sent", sentAt: new Date(), attempts: n.attempts + 1, error: null })
      .where(eq(notificationsLog.id, id));
  } catch (err) {
    const attempts = n.attempts + 1;
    await db()
      .update(notificationsLog)
      .set({ attempts, error: errorMessage(err).slice(0, 300), status: attempts >= MAX_ATTEMPTS ? "failed" : "queued" })
      .where(eq(notificationsLog.id, id));
  }
}

/** Delivers everything due (after quiet hours, or retries). Called by the scheduler. */
export async function deliverDue(now = new Date()): Promise<number> {
  const due = await db()
    .select({ id: notificationsLog.id })
    .from(notificationsLog)
    .where(
      and(
        eq(notificationsLog.status, "queued"),
        lte(notificationsLog.scheduledFor, now),
        sql`${notificationsLog.attempts} < ${MAX_ATTEMPTS}`,
      ),
    )
    .orderBy(asc(notificationsLog.scheduledFor))
    .limit(50);
  for (const { id } of due) await deliver(id);
  return due.length;
}

/** dedupe keys with a given prefix (e.g. which budget thresholds already fired this month). */
export async function existingKeys(prefix: string): Promise<string[]> {
  const rows = await db()
    .select({ key: notificationsLog.dedupeKey })
    .from(notificationsLog)
    .where(sql`${notificationsLog.dedupeKey} like ${`${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`}`);
  return rows.map((r) => r.key);
}
