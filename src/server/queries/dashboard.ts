import "server-only";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { budgets, cards, categories, rawMessages, transactions } from "@/db/schema";
import { addJalaliMonths, jalaliMonthLength } from "@/lib/format/jalali";
import {
  APP_TZ,
  currentJalaliMonth,
  dayKeyFromJalali,
  formatJalaliMonthKey,
  jalaliMonthRange,
  jalaliToUtc,
  monthKey,
  toJalaliParts,
} from "@/lib/format/time";

type Range = { start: Date; end: Date };

export type MonthTotals = { spentRial: number; incomeRial: number; count: number };

async function totals(range: Range): Promise<MonthTotals> {
  const [row] = await db()
    .select({
      spent: sql<string>`coalesce(sum(${transactions.amountRial}) filter (where ${transactions.type} = 'expense'), 0)`,
      income: sql<string>`coalesce(sum(${transactions.amountRial}) filter (where ${transactions.type} in ('income', 'refund')), 0)`,
      count: sql<number>`count(*) filter (where ${transactions.type} <> 'transfer')::int`,
    })
    .from(transactions)
    .where(and(gte(transactions.occurredAt, range.start), lt(transactions.occurredAt, range.end)));
  return { spentRial: Number(row?.spent ?? 0), incomeRial: Number(row?.income ?? 0), count: row?.count ?? 0 };
}

/** Expense amount per (leaf) category in range; split transactions contribute their parts. */
async function expenseByLeafCategory(range: Range): Promise<Map<number | null, number>> {
  // Raw SQL params carry no column type, so pass instants as ISO strings with explicit casts.
  const start = sql`${range.start.toISOString()}::timestamptz`;
  const end = sql`${range.end.toISOString()}::timestamptz`;
  const rows = await db().execute<{ category_id: number | null; amount: string }>(sql`
    select category_id, sum(amount) as amount from (
      select t.category_id, t.amount_rial as amount
      from transactions t
      where t.type = 'expense' and t.occurred_at >= ${start} and t.occurred_at < ${end}
        and not exists (select 1 from transaction_splits s where s.transaction_id = t.id)
      union all
      select s.category_id, s.amount_rial as amount
      from transaction_splits s join transactions t on t.id = s.transaction_id
      where t.type = 'expense' and t.occurred_at >= ${start} and t.occurred_at < ${end}
    ) x
    group by category_id
  `);
  return new Map(rows.map((r) => [r.category_id, Number(r.amount)]));
}

export type CategorySlice = {
  categoryId: number | null;
  name: string;
  icon: string;
  color: string;
  amountRial: number;
};

async function spendingByCategory(
  range: Range,
): Promise<{ slices: CategorySlice[]; leaf: Map<number | null, number> }> {
  const [leaf, cats] = await Promise.all([
    expenseByLeafCategory(range),
    db().select().from(categories).where(eq(categories.kind, "expense")),
  ]);
  const byId = new Map(cats.map((c) => [c.id, c]));
  const rolled = new Map<number | null, number>();
  for (const [id, amount] of leaf) {
    const cat = id === null ? undefined : byId.get(id);
    const top = cat?.parentId ?? cat?.id ?? null; // subcategories roll up into their parent
    rolled.set(top, (rolled.get(top) ?? 0) + amount);
  }
  const slices = [...rolled.entries()]
    .map(([id, amountRial]) => {
      const c = id === null ? undefined : byId.get(id);
      return {
        categoryId: id,
        name: c?.name ?? "Uncategorized",
        icon: c?.icon ?? "circle",
        color: c?.color ?? "#71717a",
        amountRial,
      };
    })
    .filter((s) => s.amountRial > 0)
    .sort((a, b) => b.amountRial - a.amountRial);
  return { slices, leaf };
}

/** Expense per Tehran-local day, keyed "YYYY-MM-DD" (Gregorian day key). */
async function dailySpending(range: Range): Promise<Map<string, number>> {
  // APP_TZ is a constant, inlined so SELECT and GROUP BY are the identical expression (a bound param would differ).
  const day = sql<string>`to_char(${transactions.occurredAt} at time zone ${sql.raw(`'${APP_TZ}'`)}, 'YYYY-MM-DD')`;
  const rows = await db()
    .select({ day, amount: sql<string>`sum(${transactions.amountRial})` })
    .from(transactions)
    .where(
      and(
        eq(transactions.type, "expense"),
        gte(transactions.occurredAt, range.start),
        lt(transactions.occurredAt, range.end),
      ),
    )
    .groupBy(day);
  return new Map(rows.map((r) => [r.day, Number(r.amount)]));
}

async function spendingByCard(range: Range) {
  const rows = await db()
    .select({
      id: cards.id,
      name: cards.name,
      color: cards.color,
      archived: cards.archived,
      spent: sql<string>`coalesce(sum(${transactions.amountRial}) filter (where ${transactions.type} = 'expense'), 0)`,
    })
    .from(cards)
    .leftJoin(
      transactions,
      and(
        eq(transactions.cardId, cards.id),
        gte(transactions.occurredAt, range.start),
        lt(transactions.occurredAt, range.end),
      ),
    )
    .groupBy(cards.id)
    .orderBy(cards.sortOrder, cards.id);
  return rows
    .map((r) => ({ id: r.id, name: r.name, color: r.color, spentRial: Number(r.spent), archived: r.archived }))
    .filter((r) => !r.archived || r.spentRial > 0);
}

export type BudgetProgress = {
  budgetId: number;
  categoryId: number;
  name: string;
  icon: string;
  color: string;
  limitRial: number;
  spentRial: number;
  thresholds: number[];
};

/** Budgets effective in `key` (latest starts_month <= key per category) with spending incl. subcategories. */
async function budgetProgress(key: string, leaf: Map<number | null, number>): Promise<BudgetProgress[]> {
  const rows = await db()
    .selectDistinctOn([budgets.categoryId], { budget: budgets, category: categories })
    .from(budgets)
    .innerJoin(categories, eq(categories.id, budgets.categoryId))
    .where(and(eq(budgets.active, true), sql`${budgets.startsMonth} <= ${key}`))
    .orderBy(budgets.categoryId, desc(budgets.startsMonth));
  if (rows.length === 0) return [];
  const children = await db().select({ id: categories.id, parentId: categories.parentId }).from(categories);
  return rows
    .map(({ budget, category }) => {
      const ids = [category.id, ...children.filter((c) => c.parentId === category.id).map((c) => c.id)];
      const spentRial = ids.reduce((s, id) => s + (leaf.get(id) ?? 0), 0);
      return {
        budgetId: budget.id,
        categoryId: category.id,
        name: category.name,
        icon: category.icon,
        color: category.color,
        limitRial: budget.amountRial,
        spentRial,
        thresholds: budget.alertThresholds,
      };
    })
    .sort((a, b) => b.spentRial / b.limitRial - a.spentRial / a.limitRial);
}

async function recentTransactions(limit = 8) {
  return db()
    .select({
      id: transactions.id,
      occurredAt: transactions.occurredAt,
      type: transactions.type,
      direction: transactions.direction,
      amountRial: transactions.amountRial,
      description: transactions.description,
      merchant: transactions.merchant,
      categoryId: transactions.categoryId,
      cardId: transactions.cardId,
      status: transactions.status,
    })
    .from(transactions)
    .orderBy(desc(transactions.occurredAt), desc(transactions.id))
    .limit(limit);
}

async function inboxCount(): Promise<number> {
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

export type DailyPoint = { dayKey: string; day: number; spentRial: number; isToday: boolean; isFuture: boolean };
export type TrendPoint = { key: string; label: string; short: string; spentRial: number; incomeRial: number };

export async function getDashboard(month: { jy: number; jm: number }, now = new Date()) {
  const current = currentJalaliMonth(now);
  const key = monthKey(month.jy, month.jm);
  const isCurrent = month.jy === current.jy && month.jm === current.jm;
  const range = jalaliMonthRange(month.jy, month.jm);
  const daysInMonth = jalaliMonthLength(month.jy, month.jm);
  const today = toJalaliParts(now);
  const dayOfMonth = isCurrent ? today.jd : daysInMonth;

  const prev = addJalaliMonths(month.jy, month.jm, -1);
  const prevRange = jalaliMonthRange(prev.jy, prev.jm);
  // Same point in the previous month: up to (and including) the same day number, clamped to its length.
  const prevCutDay = Math.min(dayOfMonth, jalaliMonthLength(prev.jy, prev.jm));
  const prevCut =
    prevCutDay >= jalaliMonthLength(prev.jy, prev.jm)
      ? prevRange.end
      : jalaliToUtc({ jy: prev.jy, jm: prev.jm, jd: prevCutDay + 1 });

  const trendMonths = Array.from({ length: 6 }, (_, i) => addJalaliMonths(month.jy, month.jm, i - 5));

  const [monthTotals, prevTotals, prevToDate, category, daily, byCard, recent, inbox, trend] = await Promise.all([
    totals(range),
    totals(prevRange),
    totals({ start: prevRange.start, end: prevCut }),
    spendingByCategory(range),
    dailySpending(range),
    spendingByCard(range),
    recentTransactions(),
    inboxCount(),
    Promise.all(
      trendMonths.map(async (m) => {
        const t = await totals(jalaliMonthRange(m.jy, m.jm));
        const k = monthKey(m.jy, m.jm);
        return {
          key: k,
          label: formatJalaliMonthKey(k),
          short: formatJalaliMonthKey(k).split(" ")[0]!.slice(0, 3),
          spentRial: t.spentRial,
          incomeRial: t.incomeRial,
        };
      }),
    ),
  ]);

  const budgetsForMonth = await budgetProgress(key, category.leaf);

  const dailyPoints: DailyPoint[] = Array.from({ length: daysInMonth }, (_, i) => {
    const dk = dayKeyFromJalali(month.jy, month.jm, i + 1);
    return {
      dayKey: dk,
      day: i + 1,
      spentRial: daily.get(dk) ?? 0,
      isToday: isCurrent && i + 1 === today.jd,
      isFuture: isCurrent && i + 1 > today.jd,
    };
  });

  // Estimates are rounded to 1,000 Toman: false precision on a projection reads as certainty.
  const roundEstimate = (rial: number) => Math.round(rial / 10_000) * 10_000;
  const projectedRial =
    isCurrent && dayOfMonth > 0
      ? roundEstimate((monthTotals.spentRial / dayOfMonth) * daysInMonth)
      : monthTotals.spentRial;

  return {
    month: {
      ...month,
      key,
      label: formatJalaliMonthKey(key),
      isCurrent,
      daysInMonth,
      dayOfMonth,
      daysLeft: daysInMonth - dayOfMonth,
    },
    canGoForward: !isCurrent && monthKey(month.jy, month.jm) < monthKey(current.jy, current.jm),
    totals: monthTotals,
    prev: {
      label: formatJalaliMonthKey(monthKey(prev.jy, prev.jm)),
      totals: prevTotals,
      toDate: prevToDate,
      cutDay: prevCutDay,
    },
    forecast: {
      projectedRial,
      dailyAverageRial: dayOfMonth > 0 ? roundEstimate(monthTotals.spentRial / dayOfMonth) : 0,
    },
    categories: category.slices,
    daily: dailyPoints,
    trend: trend as TrendPoint[],
    cards: byCard,
    budgets: budgetsForMonth,
    recent,
    inboxCount: inbox,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
