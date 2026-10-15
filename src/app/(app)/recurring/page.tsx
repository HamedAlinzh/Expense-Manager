import { desc } from "drizzle-orm";
import type { Metadata } from "next";
import { RecurringView } from "@/components/recurring/recurring-view";
import { db } from "@/db";
import { recurringSeries } from "@/db/schema";

export const metadata: Metadata = { title: "Recurring" };

const DAY = 86_400_000;

/** Series with an `overdue` flag (expected charge more than a day late), evaluated at request time. */
async function loadSeries(now = Date.now()) {
  const rows = await db().select().from(recurringSeries).orderBy(desc(recurringSeries.lastAmountRial));
  return rows.map((s) => ({
    ...s,
    overdue: s.active && s.status !== "dismissed" && s.nextExpectedAt.getTime() < now - DAY,
  }));
}

export default async function RecurringPage() {
  return <RecurringView series={await loadSeries()} />;
}
