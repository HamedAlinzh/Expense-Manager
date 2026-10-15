import "server-only";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rawMessages, recurringSeries, transactions } from "@/db/schema";
import { addJalaliMonths } from "@/lib/format/jalali";
import {
  addDaysToKey,
  dayKeyOf,
  dayStart,
  formatDate,
  formatJalaliMonthKey,
  jalaliMonthRange,
  monthKey,
  toJalaliParts,
} from "@/lib/format/time";
import { yearlyCost } from "@/lib/insights/recurring";
import { categoryEmoji, esc, toman } from "@/lib/telegram/format";
import { budgetProgress, type Range, spendingByCategory, totals } from "@/server/queries/dashboard";
import { enqueueNotification } from "@/server/notify/queue";
import { getSettings } from "@/server/settings";

function pctDelta(current: number, previous: number): string {
  if (previous <= 0) return "";
  const d = Math.round(((current - previous) / previous) * 100);
  return d === 0 ? " (same as before)" : ` (${d > 0 ? "▲" : "▼"} ${Math.abs(d)}% vs previous)`;
}

async function largestExpense(range: Range) {
  const [row] = await db()
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.occurredAt, range.start),
        lt(transactions.occurredAt, range.end),
      ),
    )
    .orderBy(desc(transactions.amountRial))
    .limit(1);
  return row ?? null;
}

async function pendingCount(): Promise<number> {
  const [[tx], [raw]] = await Promise.all([
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.status, "pending_review")),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(rawMessages)
      .where(eq(rawMessages.parseStatus, "needs_review")),
  ]);
  return (tx?.n ?? 0) + (raw?.n ?? 0);
}

type Built = { html: string; text: string; data: Record<string, unknown> };

/** Plain-text twin of the Telegram HTML, for the in-app feed. */
const plain = (html: string) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** The 7 days ending at the start of `endKey` (Friday 00:00 → previous Friday … Thursday). */
export async function buildWeeklySummary(endKey: string): Promise<Built> {
  const range = { start: dayStart(addDaysToKey(endKey, -7))!, end: dayStart(endKey)! };
  const prevRange = { start: dayStart(addDaysToKey(endKey, -14))!, end: range.start };
  const [t, prev, cats, big, pending] = await Promise.all([
    totals(range),
    totals(prevRange),
    spendingByCategory(range),
    largestExpense(range),
    pendingCount(),
  ]);
  const lines = [
    `🗓 <b>Your week</b> · ${formatDate(range.start)} – ${formatDate(new Date(range.end.getTime() - 1))}`,
    `Spent <b>${esc(toman(t.spentRial))}</b>${pctDelta(t.spentRial, prev.spentRial)}`,
    `Income ${esc(toman(t.incomeRial))} · ${t.count} transactions`,
  ];
  if (cats.slices.length) {
    lines.push("", "<b>Top categories</b>");
    for (const c of cats.slices.slice(0, 3))
      lines.push(`${categoryEmoji(c.icon)} ${esc(c.name)} — ${esc(toman(c.amountRial))}`);
  }
  if (big) lines.push("", `Largest: ${esc(toman(big.amountRial))} — ${esc(big.merchant || big.description || "—")}`);
  if (pending) lines.push(`📥 ${pending} item${pending === 1 ? "" : "s"} waiting in your inbox`);
  const html = lines.join("\n");
  return {
    html,
    text: plain(html),
    data: {
      period: "week",
      from: range.start.toISOString(),
      to: range.end.toISOString(),
      spentRial: t.spentRial,
      incomeRial: t.incomeRial,
    },
  };
}

/** Summary of the Jalali month `key` ("1405-07"). */
export async function buildMonthlySummary(key: string): Promise<Built> {
  const [jy, jm] = key.split("-").map(Number) as [number, number];
  const range = jalaliMonthRange(jy, jm);
  const before = addJalaliMonths(jy, jm, -1);
  const [t, prev, cats, recurring] = await Promise.all([
    totals(range),
    totals(jalaliMonthRange(before.jy, before.jm)),
    spendingByCategory(range),
    db()
      .select()
      .from(recurringSeries)
      .where(and(eq(recurringSeries.active, true), sql`${recurringSeries.status} <> 'dismissed'`)),
  ]);
  const budgets = await budgetProgress(key, cats.leaf);
  const net = t.incomeRial - t.spentRial;
  const savings = t.incomeRial > 0 ? Math.round((net / t.incomeRial) * 100) : null;
  const lines = [
    `🌙 <b>${formatJalaliMonthKey(key)} in review</b>`,
    `Spent <b>${esc(toman(t.spentRial))}</b>${pctDelta(t.spentRial, prev.spentRial)}`,
    `Income ${esc(toman(t.incomeRial))} · Net ${esc(toman(net, { sign: "always" }))}${
      savings === null ? "" : savings >= 0 ? ` · Saved ${savings}%` : ` · Spent ${-savings}% more than you earned`
    }`,
  ];
  if (cats.slices.length) {
    lines.push("", "<b>Where it went</b>");
    for (const c of cats.slices.slice(0, 5))
      lines.push(
        `${categoryEmoji(c.icon)} ${esc(c.name)} — ${esc(toman(c.amountRial))} (${t.spentRial ? Math.round((c.amountRial / t.spentRial) * 100) : 0}%)`,
      );
  }
  if (budgets.length) {
    const over = budgets.filter((b) => b.spentRial > b.limitRial);
    lines.push(
      "",
      over.length
        ? `🎯 Over budget: ${over.map((b) => esc(b.name)).join(", ")}`
        : `🎯 All ${budgets.length} budgets kept 👏`,
    );
  }
  if (recurring.length) {
    const monthlyCost = recurring.reduce((s, r) => s + yearlyCost(r.lastAmountRial, r.interval) / 12, 0);
    lines.push(`🔁 Recurring payments ≈ ${esc(toman(Math.round(monthlyCost / 10) * 10))}/month`);
  }
  const html = lines.join("\n");
  return {
    html,
    text: plain(html),
    data: { period: "month", month: key, spentRial: t.spentRial, incomeRial: t.incomeRial, savingsRate: savings },
  };
}

/** Friday-morning weekly summary (key = that Friday). */
export async function sendWeeklySummary(now = new Date()): Promise<void> {
  if (!(await getSettings()).weeklySummary) return;
  const key = dayKeyOf(now);
  const s = await buildWeeklySummary(key);
  await enqueueNotification(
    { type: "weekly_summary", dedupeKey: `weekly-summary:${key}`, ...s, quietHours: false },
    now,
  );
}

/** Summary of the previous Jalali month, sent on the 1st. */
export async function sendMonthlySummary(now = new Date()): Promise<void> {
  if (!(await getSettings()).monthlySummary) return;
  const { jy, jm } = toJalaliParts(now);
  const prev = addJalaliMonths(jy, jm, -1);
  const key = monthKey(prev.jy, prev.jm);
  const s = await buildMonthlySummary(key);
  await enqueueNotification(
    { type: "monthly_summary", dedupeKey: `monthly-summary:${key}`, ...s, quietHours: false },
    now,
  );
}
