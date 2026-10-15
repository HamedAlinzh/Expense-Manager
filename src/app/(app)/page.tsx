import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { currentJalaliMonth, monthKey, parseMonthKey } from "@/lib/format/time";
import { getDashboard } from "@/server/queries/dashboard";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: PageProps<"/">) {
  const { month } = await searchParams;
  const current = currentJalaliMonth();
  const requested = typeof month === "string" ? parseMonthKey(month) : null;
  // Future months are clamped to the current one.
  const selected =
    requested && monthKey(requested.jy, requested.jm) <= monthKey(current.jy, current.jm) ? requested : current;
  return <DashboardView data={await getDashboard(selected)} />;
}
