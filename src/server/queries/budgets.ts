import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { budgets } from "@/db/schema";
import { addJalaliMonths, jalaliMonthLength } from "@/lib/format/jalali";
import {
  currentJalaliMonth,
  formatJalaliMonthKey,
  jalaliMonthProgress,
  jalaliMonthRange,
  monthKey,
} from "@/lib/format/time";
import { budgetProgress, spendingByCategory } from "./dashboard";

export async function getBudgetsPage(month: { jy: number; jm: number }, now = new Date()) {
  const key = monthKey(month.jy, month.jm);
  const current = currentJalaliMonth(now);
  const isCurrent = month.jy === current.jy && month.jm === current.jm;
  const { leaf } = await spendingByCategory(jalaliMonthRange(month.jy, month.jm));
  const progress = await budgetProgress(key, leaf);

  // The version in effect for each budgeted category (for editing thresholds / showing "since").
  const versions = await db()
    .selectDistinctOn([budgets.categoryId])
    .from(budgets)
    .where(sql`${budgets.startsMonth} <= ${key}`)
    .orderBy(budgets.categoryId, desc(budgets.startsMonth));
  const versionByCat = new Map(versions.map((v) => [v.categoryId, v]));

  const history = await Promise.all(
    Array.from({ length: 6 }, (_, i) => addJalaliMonths(month.jy, month.jm, i - 5)).map(async (m) => {
      const k = monthKey(m.jy, m.jm);
      const { leaf: l } = await spendingByCategory(jalaliMonthRange(m.jy, m.jm));
      const p = await budgetProgress(k, l);
      return {
        key: k,
        label: formatJalaliMonthKey(k),
        items: p.map((b) => ({ categoryId: b.categoryId, spentRial: b.spentRial, limitRial: b.limitRial })),
      };
    }),
  );

  const daysInMonth = jalaliMonthLength(month.jy, month.jm);
  const dayOfMonth = isCurrent ? jalaliMonthProgress(now).dayOfMonth : daysInMonth;
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
    canGoForward: key < monthKey(current.jy, current.jm),
    budgets: progress.map((b) => ({ ...b, startsMonth: versionByCat.get(b.categoryId)?.startsMonth ?? key })),
    history,
  };
}

export type BudgetsPageData = Awaited<ReturnType<typeof getBudgetsPage>>;

export async function budgetVersion(categoryId: number, month: string) {
  const [row] = await db()
    .select()
    .from(budgets)
    .where(and(eq(budgets.categoryId, categoryId), eq(budgets.startsMonth, month)));
  return row ?? null;
}
