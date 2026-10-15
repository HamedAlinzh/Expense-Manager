import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { cards, categories, transactions } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/format/time";
import { parseFilters } from "@/lib/schemas/transaction";
import { buildWhere } from "@/server/queries/transactions";

export const dynamic = "force-dynamic";

const MAX_ROWS = 50_000;

function csvCell(v: unknown): string {
  if (typeof v === "number") return String(v); // numbers stay numeric (negative amounts are fine)
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralize spreadsheet formula injection in text cells, then quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** CSV of transactions matching the same filters as the Transactions page (UTF-8 with BOM for Excel). */
export async function GET(req: Request) {
  if (!(await getSession()).authenticated) return Response.json({ error: "unauthorized" }, { status: 401 });
  const filters = parseFilters(new URL(req.url).searchParams);
  const rows = await db()
    .select({ t: transactions, card: cards.name, category: categories.name })
    .from(transactions)
    .leftJoin(cards, eq(cards.id, transactions.cardId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(await buildWhere(filters))
    .orderBy(desc(transactions.occurredAt))
    .limit(MAX_ROWS);

  const head = [
    "date_jalali",
    "time",
    "date_gregorian",
    "type",
    "direction",
    "amount_rial",
    "amount_toman",
    "card",
    "category",
    "description",
    "merchant",
    "tags",
    "note",
    "source",
    "status",
    "balance_after_rial",
  ];
  const lines = [head.join(",")];
  for (const { t, card, category } of rows) {
    const signed = t.direction === "out" ? -t.amountRial : t.amountRial;
    lines.push(
      [
        formatDate(t.occurredAt),
        formatDate(t.occurredAt, { time: true }).split(" — ")[1],
        formatDate(t.occurredAt, { calendar: "gregorian" }).replace(/\//g, "-"),
        t.type,
        t.direction,
        signed,
        signed / 10,
        card,
        category,
        t.description,
        t.merchant,
        t.tags.join(" "),
        t.note,
        t.source,
        t.status,
        t.balanceAfterRial,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const from = filters.from ?? "all";
  const to = filters.to ?? "now";
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
