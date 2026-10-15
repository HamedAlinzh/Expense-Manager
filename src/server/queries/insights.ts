import "server-only";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, notificationsLog, transactions } from "@/db/schema";
import { addJalaliMonths } from "@/lib/format/jalali";
import { formatJalaliMonthKey, jalaliMonthRange, monthKey } from "@/lib/format/time";
import { anomalyCheck } from "@/lib/insights/alerts";
import { recurringKey } from "@/lib/insights/recurring";
import { type Range, spendingByCategory, totals } from "./dashboard";

const DAY = 86_400_000;

async function incomeBySource(range: Range) {
  const rows = await db()
    .select({ categoryId: transactions.categoryId, amount: sql<string>`sum(${transactions.amountRial})` })
    .from(transactions)
    .where(
      and(
        inArray(transactions.type, ["income", "refund"]),
        gte(transactions.occurredAt, range.start),
        lt(transactions.occurredAt, range.end),
      ),
    )
    .groupBy(transactions.categoryId);
  const cats = await db().select().from(categories).where(eq(categories.kind, "income"));
  return rows
    .map((r) => {
      const c = cats.find((x) => x.id === r.categoryId);
      return {
        categoryId: r.categoryId,
        name: c?.name ?? "Uncategorized",
        icon: c?.icon ?? "circle",
        color: c?.color ?? "#71717a",
        amountRial: Number(r.amount),
      };
    })
    .sort((a, b) => b.amountRial - a.amountRial);
}

export async function getInsights(month: { jy: number; jm: number }) {
  const key = monthKey(month.jy, month.jm);
  const range = jalaliMonthRange(month.jy, month.jm);
  const prevM = addJalaliMonths(month.jy, month.jm, -1);
  const prevRange = jalaliMonthRange(prevM.jy, prevM.jm);

  const [cur, prev, income, monthTotals] = await Promise.all([
    spendingByCategory(range),
    spendingByCategory(prevRange),
    incomeBySource(range),
    totals(range),
  ]);

  // Month-over-month per (top-level) category.
  const ids = new Set([...cur.slices, ...prev.slices].map((s) => s.categoryId));
  const momRows = [...ids].map((id) => {
    const a = cur.slices.find((s) => s.categoryId === id);
    const b = prev.slices.find((s) => s.categoryId === id);
    const base = a ?? b!;
    const thisRial = a?.amountRial ?? 0;
    const prevRial = b?.amountRial ?? 0;
    return {
      categoryId: id,
      name: base.name,
      icon: base.icon,
      color: base.color,
      thisRial,
      prevRial,
      delta: thisRial - prevRial,
      deltaPct: prevRial > 0 ? (thisRial - prevRial) / prevRial : null,
    };
  });
  momRows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  // Expenses of the last 13 months: top merchants this month + unusual transactions.
  const history = await db()
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.occurredAt, new Date(range.start.getTime() - 365 * DAY)),
        lt(transactions.occurredAt, range.end),
      ),
    );
  const inMonth = history.filter((t) => t.occurredAt >= range.start);

  const merchants = new Map<string, { name: string; amountRial: number; count: number }>();
  for (const t of inMonth) {
    const k = recurringKey(t.merchant, t.description);
    if (!k) continue;
    const m = merchants.get(k) ?? { name: t.merchant || t.description, amountRial: 0, count: 0 };
    m.amountRial += t.amountRial;
    m.count++;
    merchants.set(k, m);
  }
  const topMerchants = [...merchants.values()].sort((a, b) => b.amountRial - a.amountRial).slice(0, 10);
  const unnamedRial = inMonth
    .filter((t) => !recurringKey(t.merchant, t.description))
    .reduce((s, t) => s + t.amountRial, 0);

  const unusual = inMonth
    .map((t) => {
      const before = history.filter((h) => h.id !== t.id && h.occurredAt < t.occurredAt);
      const k = recurringKey(t.merchant, t.description);
      const same = k
        ? before.filter((h) => recurringKey(h.merchant, h.description) === k).map((h) => h.amountRial)
        : [];
      const cat = t.categoryId ? before.filter((h) => h.categoryId === t.categoryId).map((h) => h.amountRial) : [];
      const r =
        same.length >= 5 ? anomalyCheck(t.amountRial, same) : anomalyCheck(t.amountRial, cat, { minHistory: 8 });
      return r.anomalous
        ? {
            id: t.id,
            occurredAt: t.occurredAt,
            amountRial: t.amountRial,
            title: t.merchant || t.description,
            categoryId: t.categoryId,
            typicalRial: r.typicalRial!,
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.amountRial - a.amountRial)
    .slice(0, 10);

  const largest = [...inMonth]
    .sort((a, b) => b.amountRial - a.amountRial)
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      occurredAt: t.occurredAt,
      amountRial: t.amountRial,
      title: t.merchant || t.description,
      categoryId: t.categoryId,
    }));

  // The Jalali year of the selected month.
  const year = await Promise.all(
    Array.from({ length: 12 }, (_, i) => i + 1).map(async (jm) => {
      const k = monthKey(month.jy, jm);
      const t = await totals(jalaliMonthRange(month.jy, jm));
      return {
        key: k,
        label: formatJalaliMonthKey(k),
        spentRial: t.spentRial,
        incomeRial: t.incomeRial,
        count: t.count,
      };
    }),
  );

  const feed = await db().select().from(notificationsLog).orderBy(desc(notificationsLog.createdAt)).limit(20);

  return {
    month: {
      ...month,
      key,
      label: formatJalaliMonthKey(key),
      prevLabel: formatJalaliMonthKey(monthKey(prevM.jy, prevM.jm)),
    },
    totals: monthTotals,
    mom: momRows,
    income,
    topMerchants,
    unnamedRial,
    unusual,
    largest,
    year: { jy: month.jy, months: year },
    feed: feed.map((n) => ({
      id: n.id,
      type: n.type,
      status: n.status,
      createdAt: n.createdAt,
      text: (n.payload as { text?: string } | null)?.text ?? "",
    })),
  };
}

export type InsightsData = Awaited<ReturnType<typeof getInsights>>;
