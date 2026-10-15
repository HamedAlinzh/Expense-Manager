import type { Metadata } from "next";
import { BudgetsView } from "@/components/budgets/budgets-view";
import { currentJalaliMonth, monthKey, parseMonthKey } from "@/lib/format/time";
import { getBudgetsPage } from "@/server/queries/budgets";

export const metadata: Metadata = { title: "Budgets" };

export default async function BudgetsPage({ searchParams }: PageProps<"/budgets">) {
  const { month } = await searchParams;
  const current = currentJalaliMonth();
  const requested = typeof month === "string" ? parseMonthKey(month) : null;
  const selected =
    requested && monthKey(requested.jy, requested.jm) <= monthKey(current.jy, current.jm) ? requested : current;
  return <BudgetsView data={await getBudgetsPage(selected)} />;
}
