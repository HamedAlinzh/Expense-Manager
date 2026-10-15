import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { recurringSeries, transactions } from "@/db/schema";
import { dayKeyOf, formatDate } from "@/lib/format/time";
import {
  detectSeries,
  type Interval,
  MISSING_GRACE_DAYS,
  priceChange,
  type RecurringTx,
  recurringKey,
} from "@/lib/insights/recurring";
import { esc, toman } from "@/lib/telegram/format";
import { enqueueNotification } from "@/server/notify/queue";
import { getSettings } from "@/server/settings";

const DAY = 86_400_000;
const INTERVAL_DAYS: Record<Interval, number> = { weekly: 7, monthly: 30, yearly: 365 };

/**
 * Scans the last ~13 months of expenses for recurring charges, upserts recurring_series (keeping
 * the user's confirm/dismiss decision), and queues price-increase and missing-charge alerts.
 */
export async function runRecurringDetection(now = new Date()): Promise<{ series: number; alerts: number }> {
  const since = new Date(now.getTime() - 400 * DAY);
  const rows = await db()
    .select()
    .from(transactions)
    .where(and(eq(transactions.type, "expense"), gte(transactions.occurredAt, since)));

  const groups = new Map<string, RecurringTx[]>();
  for (const t of rows) {
    const key = recurringKey(t.merchant, t.description);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push({
      id: t.id,
      amountRial: t.amountRial,
      occurredAt: t.occurredAt,
      display: t.merchant || t.description,
      cardId: t.cardId,
      categoryId: t.categoryId,
    });
    groups.set(key, list);
  }

  const detections = [...groups.entries()]
    .map(([k, txs]) => detectSeries(k, txs))
    .filter((d): d is NonNullable<typeof d> => d !== null);
  const existing = detections.length
    ? await db()
        .select()
        .from(recurringSeries)
        .where(
          inArray(
            recurringSeries.key,
            detections.map((d) => d.key),
          ),
        )
    : [];
  const byKey = new Map(existing.map((e) => [e.key, e]));
  const settings = await getSettings();
  let alerts = 0;

  for (const d of detections) {
    const prev = byKey.get(d.key);
    const [saved] = await db()
      .insert(recurringSeries)
      .values({ ...d, active: true })
      .onConflictDoUpdate({
        target: recurringSeries.key,
        set: {
          merchant: d.merchant,
          cardId: d.cardId,
          categoryId: d.categoryId,
          typicalAmountRial: d.typicalAmountRial,
          lastAmountRial: d.lastAmountRial,
          lastTransactionId: d.lastTransactionId,
          interval: d.interval,
          lastSeenAt: d.lastSeenAt,
          nextExpectedAt: d.nextExpectedAt,
          occurrences: d.occurrences,
          active: true,
          updatedAt: now,
        },
      })
      .returning();
    if (!saved || saved.status === "dismissed" || !settings.notifyRecurring) continue;

    // A new charge that costs more than usual.
    const change = priceChange(d);
    const isNewCharge = !prev || prev.lastTransactionId !== d.lastTransactionId;
    if (change !== null && change > 0 && isNewCharge && now.getTime() - d.lastSeenAt.getTime() < 7 * DAY) {
      const queued = await enqueueNotification(
        {
          type: "recurring_price",
          dedupeKey: `recurring-price:${saved.id}:${d.lastTransactionId}`,
          html: `📈 <b>${esc(d.merchant)}</b> costs more: ${esc(toman(d.lastAmountRial))} (usually ${esc(toman(d.typicalAmountRial))}, +${Math.round(change * 100)}%)`,
          text: `${d.merchant} costs more: ${toman(d.lastAmountRial)} (usually ${toman(d.typicalAmountRial)})`,
          data: { seriesId: saved.id, change },
        },
        now,
      );
      if (queued) alerts++;
    }
  }

  // Confirmed series whose expected charge hasn't arrived after the grace period.
  const confirmed = await db()
    .select()
    .from(recurringSeries)
    .where(and(eq(recurringSeries.status, "confirmed"), eq(recurringSeries.active, true)));
  for (const s of confirmed) {
    const overdueMs = now.getTime() - s.nextExpectedAt.getTime();
    if (overdueMs > 3 * INTERVAL_DAYS[s.interval] * DAY) {
      await db().update(recurringSeries).set({ active: false }).where(eq(recurringSeries.id, s.id)); // stopped long ago
      continue;
    }
    if (!settings.notifyRecurring || overdueMs < MISSING_GRACE_DAYS[s.interval] * DAY) continue;
    const queued = await enqueueNotification(
      {
        type: "recurring_missing",
        dedupeKey: `recurring-missing:${s.id}:${dayKeyOf(s.nextExpectedAt)}`,
        html: `⏰ <b>${esc(s.merchant)}</b> (${esc(toman(s.lastAmountRial))}) was expected around ${formatDate(s.nextExpectedAt)} and hasn't appeared yet.`,
        text: `${s.merchant} (${toman(s.lastAmountRial)}) was expected around ${formatDate(s.nextExpectedAt)} and hasn't appeared yet.`,
        data: { seriesId: s.id },
      },
      now,
    );
    if (queued) alerts++;
  }
  return { series: detections.length, alerts };
}
