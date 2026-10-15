import { db } from "@/db";
import * as s from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { dayKeyOf } from "@/lib/format/time";

export const dynamic = "force-dynamic";

/** Full JSON backup of all user data. Amounts are integer Rial; timestamps are ISO-8601 UTC. */
export async function GET() {
  if (!(await getSession()).authenticated) return Response.json({ error: "unauthorized" }, { status: 401 });
  const d = db();
  const [
    settings,
    cards,
    categories,
    categoryRules,
    transactions,
    transactionSplits,
    rawMessages,
    budgets,
    recurringSeries,
    savedViews,
    importMappings,
  ] = await Promise.all([
    d.select().from(s.settings),
    d.select().from(s.cards),
    d.select().from(s.categories),
    d.select().from(s.categoryRules),
    d.select().from(s.transactions),
    d.select().from(s.transactionSplits),
    d.select().from(s.rawMessages),
    d.select().from(s.budgets),
    d.select().from(s.recurringSeries),
    d.select().from(s.savedViews),
    d.select().from(s.importMappings),
  ]);
  const body = JSON.stringify(
    {
      format: "expense-manager-backup",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: {
        settings,
        cards,
        categories,
        categoryRules,
        transactions,
        transactionSplits,
        rawMessages,
        budgets,
        recurringSeries,
        savedViews,
        importMappings,
      },
    },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="expense-manager-${dayKeyOf(new Date())}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
