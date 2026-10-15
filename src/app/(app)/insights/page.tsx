import type { Metadata } from "next";
import { InsightsView } from "@/components/insights/insights-view";
import { currentJalaliMonth, parseMonthKey } from "@/lib/format/time";
import { getInsights } from "@/server/queries/insights";

export const metadata: Metadata = { title: "Insights" };

export default async function InsightsPage({ searchParams }: PageProps<"/insights">) {
  const { month } = await searchParams;
  const selected = (typeof month === "string" && parseMonthKey(month)) || currentJalaliMonth();
  return <InsightsView data={await getInsights(selected)} />;
}
