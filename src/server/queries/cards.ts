import "server-only";
import { and, asc, eq, gte, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { type Card, cards, transactions } from "@/db/schema";

export type CardWithStats = Card & {
  monthSpentRial: number;
  monthIncomeRial: number;
  monthCount: number;
  totalCount: number;
};

export async function listCards(opts: { includeArchived?: boolean } = {}): Promise<Card[]> {
  return db()
    .select()
    .from(cards)
    .where(opts.includeArchived ? undefined : eq(cards.archived, false))
    .orderBy(asc(cards.sortOrder), asc(cards.id));
}

/** Cards with spending/income in [start, end). Transfers between own cards are excluded from totals. */
export async function listCardsWithStats(range: { start: Date; end: Date }): Promise<CardWithStats[]> {
  const month = db()
    .select({
      cardId: transactions.cardId,
      spent:
        sql<string>`coalesce(sum(${transactions.amountRial}) filter (where ${transactions.type} = 'expense'), 0)`.as(
          "spent",
        ),
      income:
        sql<string>`coalesce(sum(${transactions.amountRial}) filter (where ${transactions.type} in ('income', 'refund')), 0)`.as(
          "income",
        ),
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(transactions)
    .where(
      and(
        gte(transactions.occurredAt, range.start),
        lt(transactions.occurredAt, range.end),
        ne(transactions.type, "transfer"),
      ),
    )
    .groupBy(transactions.cardId)
    .as("month");

  const totals = db()
    .select({ cardId: transactions.cardId, total: sql<number>`count(*)::int`.as("total") })
    .from(transactions)
    .groupBy(transactions.cardId)
    .as("totals");

  const rows = await db()
    .select({ card: cards, spent: month.spent, income: month.income, count: month.count, total: totals.total })
    .from(cards)
    .leftJoin(month, eq(month.cardId, cards.id))
    .leftJoin(totals, eq(totals.cardId, cards.id))
    .orderBy(asc(cards.archived), asc(cards.sortOrder), asc(cards.id));

  return rows.map((r) => ({
    ...r.card,
    monthSpentRial: Number(r.spent ?? 0),
    monthIncomeRial: Number(r.income ?? 0),
    monthCount: r.count ?? 0,
    totalCount: r.total ?? 0,
  }));
}
