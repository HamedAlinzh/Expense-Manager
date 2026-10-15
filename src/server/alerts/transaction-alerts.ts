import "server-only";
import { and, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { cards, categories, transactions, transactionSplits } from "@/db/schema";
import {
  currentJalaliMonth,
  dayKeyOf,
  formatDate,
  jalaliMonthKeyOf,
  jalaliMonthProgress,
  jalaliMonthRange,
  monthKey,
} from "@/lib/format/time";
import { anomalyCheck, newThreshold } from "@/lib/insights/alerts";
import { recurringKey } from "@/lib/insights/recurring";
import { esc, toman } from "@/lib/telegram/format";
import { budgetProgress, spendingByCategory } from "@/server/queries/dashboard";
import { enqueueNotification, existingKeys } from "@/server/notify/queue";
import { getSettings } from "@/server/settings";

const DAY = 86_400_000;

/** Runs every alert that a new or changed transaction can trigger. */
export async function checkTransaction(txId: number, now = new Date()): Promise<void> {
  const [tx] = await db().select().from(transactions).where(eq(transactions.id, txId));
  if (!tx) return;
  const s = await getSettings();
  if (tx.type === "expense" && s.notifyBudgetAlerts) await budgetAlerts(tx, now);
  if (tx.type === "expense" && s.notifyAnomalies) await anomalyAlert(tx, now);
  if (tx.cardId && s.notifyLowBalance) await lowBalanceAlert(tx.cardId, now);
}

type Tx = typeof transactions.$inferSelect;

async function budgetAlerts(tx: Tx, now: Date) {
  const { jy, jm } = currentJalaliMonth(now);
  const key = monthKey(jy, jm);
  if (jalaliMonthKeyOf(tx.occurredAt) !== key) return; // only this month's budgets alert

  // Categories this transaction touches (its own or its splits'), plus their parents.
  const splitCats = await db()
    .select({ id: transactionSplits.categoryId })
    .from(transactionSplits)
    .where(eq(transactionSplits.transactionId, tx.id));
  const touched = [tx.categoryId, ...splitCats.map((c) => c.id)].filter((x): x is number => x !== null);
  if (touched.length === 0) return;
  const parents = await db()
    .select({ parentId: categories.parentId })
    .from(categories)
    .where(inArray(categories.id, touched));
  const relevant = new Set([...touched, ...parents.map((p) => p.parentId).filter((x): x is number => x !== null)]);

  const { leaf } = await spendingByCategory(jalaliMonthRange(jy, jm));
  const budgets = (await budgetProgress(key, leaf)).filter((b) => relevant.has(b.categoryId));
  const { daysLeft } = jalaliMonthProgress(now);
  for (const b of budgets) {
    const prefix = `budget:${b.categoryId}:${key}:`;
    const sent = new Set((await existingKeys(prefix)).map((k) => Number(k.slice(prefix.length))));
    const t = newThreshold(b.spentRial, b.limitRial, b.thresholds, sent);
    if (t === null) continue;
    const pct = Math.round((b.spentRial / b.limitRial) * 100);
    const left = `${daysLeft} day${daysLeft === 1 ? "" : "s"} left this month`;
    const head = t >= 100 ? `🔴 <b>${esc(b.name)}</b> budget exceeded` : `⚠️ <b>${esc(b.name)}</b> budget at ${pct}%`;
    const line = `${toman(b.spentRial)} of ${toman(b.limitRial)} used — ${left}`;
    await enqueueNotification(
      {
        type: "budget",
        dedupeKey: `${prefix}${t}`,
        html: `${head}\n${esc(line)}`,
        text: `${b.name}: ${line}`,
        data: { categoryId: b.categoryId, month: key, threshold: t, spentRial: b.spentRial, limitRial: b.limitRial },
      },
      now,
    );
  }
}

async function anomalyAlert(tx: Tx, now: Date) {
  if (now.getTime() - tx.occurredAt.getTime() > 3 * DAY) return; // don't alert about old imports/backfills
  const since = new Date(tx.occurredAt.getTime() - 365 * DAY);
  const history = await db()
    .select({
      amount: transactions.amountRial,
      merchant: transactions.merchant,
      description: transactions.description,
      categoryId: transactions.categoryId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "expense"),
        ne(transactions.id, tx.id),
        gte(transactions.occurredAt, since),
        lt(transactions.occurredAt, tx.occurredAt),
      ),
    );

  const key = recurringKey(tx.merchant, tx.description);
  const sameMerchant = key
    ? history.filter((h) => recurringKey(h.merchant, h.description) === key).map((h) => h.amount)
    : [];
  const sameCategory = tx.categoryId ? history.filter((h) => h.categoryId === tx.categoryId).map((h) => h.amount) : [];
  const basis =
    sameMerchant.length >= 5
      ? { label: "this merchant", values: sameMerchant, min: 5 }
      : { label: "this category", values: sameCategory, min: 8 };
  const r = anomalyCheck(tx.amountRial, basis.values, { minHistory: basis.min });
  if (!r.anomalous || r.typicalRial === null) return;

  const [cat] = tx.categoryId
    ? await db().select({ name: categories.name }).from(categories).where(eq(categories.id, tx.categoryId))
    : [];
  const title = tx.merchant || tx.description || cat?.name || "a transaction";
  const ratio = Math.round(tx.amountRial / r.typicalRial);
  await enqueueNotification(
    {
      type: "anomaly",
      dedupeKey: `anomaly:${tx.id}`,
      html: `🧐 <b>Unusual expense</b>: ${esc(toman(tx.amountRial))} — ${esc(title)}\nAbout ${ratio}× your typical ${esc(toman(r.typicalRial))} for ${basis.label}. ${formatDate(tx.occurredAt, { time: true })}`,
      text: `Unusual expense: ${toman(tx.amountRial)} — ${title} (typically ${toman(r.typicalRial)} for ${basis.label})`,
      data: { transactionId: tx.id, typicalRial: r.typicalRial },
    },
    now,
  );
}

async function lowBalanceAlert(cardId: number, now: Date) {
  const [card] = await db().select().from(cards).where(eq(cards.id, cardId));
  if (!card || card.lowBalanceThresholdRial === null || card.lastKnownBalanceRial === null) return;
  if (card.lastKnownBalanceRial >= card.lowBalanceThresholdRial) return;
  await enqueueNotification(
    {
      type: "low_balance",
      dedupeKey: `lowbal:${card.id}:${dayKeyOf(now)}`, // at most once a day per card
      html: `🪫 <b>${esc(card.name)}</b> balance is low: ${esc(toman(card.lastKnownBalanceRial))} (alert below ${esc(toman(card.lowBalanceThresholdRial))})`,
      text: `${card.name} balance is low: ${toman(card.lastKnownBalanceRial)}`,
      data: { cardId: card.id, balanceRial: card.lastKnownBalanceRial },
    },
    now,
  );
}
