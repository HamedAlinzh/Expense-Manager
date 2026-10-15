import "server-only";
import { and, asc, desc, eq, exists, gte, inArray, isNull, lt, lte, ne, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { cards, categories, rawMessages, savedViews, transactions, transactionSplits } from "@/db/schema";
import { dayEnd, dayStart } from "@/lib/format/time";
import { normalizeDigits, toPersianDigits } from "@/lib/format/text";
import type { TxFilters } from "@/lib/schemas/transaction";

export const PAGE_SIZE = 50;

/** Must match the expression of the `transactions_search_trgm` index. */
const searchExpr = sql`(coalesce(${transactions.description}, '') || ' ' || coalesce(${transactions.merchant}, '') || ' ' || coalesce(${transactions.note}, ''))`;

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

async function expandCategoryIds(ids: number[]): Promise<number[]> {
  const real = ids.filter((i) => i > 0);
  if (real.length === 0) return [];
  const children = await db().select({ id: categories.id }).from(categories).where(inArray(categories.parentId, real));
  return [...new Set([...real, ...children.map((c) => c.id)])];
}

export async function buildWhere(f: TxFilters): Promise<SQL | undefined> {
  const conds: (SQL | undefined)[] = [];

  if (f.q) {
    // Match the text as typed and with Western/Persian digits, so "۱۲" finds "12" and vice versa.
    const variants = [...new Set([f.q, normalizeDigits(f.q), toPersianDigits(normalizeDigits(f.q))])];
    conds.push(or(...variants.map((v) => sql`${searchExpr} ilike ${`%${escapeLike(v)}%`}`)));
  }
  if (f.from) {
    const start = dayStart(f.from);
    if (start) conds.push(gte(transactions.occurredAt, start));
  }
  if (f.to) {
    const end = dayEnd(f.to);
    if (end) conds.push(lt(transactions.occurredAt, end));
  }
  if (f.cards.length) conds.push(inArray(transactions.cardId, f.cards));
  if (f.types.length) conds.push(inArray(transactions.type, f.types));
  if (f.tags.length) conds.push(sql`${transactions.tags} && ${sql.param(f.tags)}::text[]`);
  if (f.minRial !== undefined) conds.push(gte(transactions.amountRial, f.minRial));
  if (f.maxRial !== undefined) conds.push(lte(transactions.amountRial, f.maxRial));
  if (f.status) conds.push(eq(transactions.status, f.status));
  if (f.sources.length) conds.push(inArray(transactions.source, f.sources));

  if (f.categories.length) {
    const catIds = await expandCategoryIds(f.categories);
    const parts: SQL[] = [];
    if (catIds.length) {
      parts.push(inArray(transactions.categoryId, catIds));
      parts.push(
        exists(
          db()
            .select({ one: sql`1` })
            .from(transactionSplits)
            .where(
              and(eq(transactionSplits.transactionId, transactions.id), inArray(transactionSplits.categoryId, catIds)),
            ),
        ),
      );
    }
    if (f.categories.includes(0)) {
      parts.push(
        and(
          isNull(transactions.categoryId),
          ne(transactions.type, "transfer"), // transfers never carry a category
          sql`not exists (select 1 from ${transactionSplits} where ${transactionSplits.transactionId} = ${transactions.id})`,
        )!,
      );
    }
    conds.push(or(...parts));
  }

  return and(...conds.filter(Boolean));
}

export type TxListRow = {
  id: number;
  occurredAt: Date;
  type: "expense" | "income" | "transfer" | "refund";
  direction: "in" | "out";
  amountRial: number;
  description: string;
  merchant: string | null;
  categoryId: number | null;
  tags: string[];
  note: string | null;
  source: "manual" | "csv" | "sms" | "notification" | "telegram";
  status: "pending_review" | "confirmed";
  cardId: number | null;
  linkedTransactionId: number | null;
  /** Card on the other side of a transfer. */
  linkedCardId: number | null;
  reconciledAt: Date | null;
  splitCount: number;
  hasRaw: boolean;
};

export type TxTotals = { count: number; expenseRial: number; incomeRial: number };

export async function listTransactions(
  f: TxFilters,
): Promise<{ rows: TxListRow[]; totals: TxTotals; page: number; pageCount: number }> {
  const where = await buildWhere(f);

  const [totalsRow] = await db()
    .select({
      count: sql<number>`count(*)::int`,
      expense: sql<string>`coalesce(sum(${transactions.amountRial}) filter (where ${transactions.type} = 'expense'), 0)`,
      income: sql<string>`coalesce(sum(${transactions.amountRial}) filter (where ${transactions.type} in ('income', 'refund')), 0)`,
    })
    .from(transactions)
    .where(where);

  const count = totalsRow?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const page = Math.min(f.page, pageCount);

  const splitCounts = db()
    .select({ txId: transactionSplits.transactionId, n: sql<number>`count(*)::int`.as("n") })
    .from(transactionSplits)
    .groupBy(transactionSplits.transactionId)
    .as("split_counts");

  const partner = alias(transactions, "partner");
  const rows = await db()
    .select({
      id: transactions.id,
      occurredAt: transactions.occurredAt,
      type: transactions.type,
      direction: transactions.direction,
      amountRial: transactions.amountRial,
      description: transactions.description,
      merchant: transactions.merchant,
      categoryId: transactions.categoryId,
      tags: transactions.tags,
      note: transactions.note,
      source: transactions.source,
      status: transactions.status,
      cardId: transactions.cardId,
      linkedTransactionId: transactions.linkedTransactionId,
      linkedCardId: partner.cardId,
      reconciledAt: transactions.reconciledAt,
      splitCount: sql<number>`coalesce(${splitCounts.n}, 0)`,
      hasRaw: sql<boolean>`${transactions.rawMessageId} is not null`,
    })
    .from(transactions)
    .leftJoin(splitCounts, eq(splitCounts.txId, transactions.id))
    .leftJoin(partner, eq(partner.id, transactions.linkedTransactionId))
    .where(where)
    .orderBy(desc(transactions.occurredAt), desc(transactions.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  return {
    rows: rows.map((r) => ({ ...r, splitCount: Number(r.splitCount) })),
    totals: { count, expenseRial: Number(totalsRow?.expense ?? 0), incomeRial: Number(totalsRow?.income ?? 0) },
    page,
    pageCount,
  };
}

export async function getTransactionDetail(id: number) {
  const [tx] = await db().select().from(transactions).where(eq(transactions.id, id));
  if (!tx) return null;
  const [raw, splits, linked] = await Promise.all([
    tx.rawMessageId
      ? db()
          .select({
            body: rawMessages.body,
            sender: rawMessages.sender,
            receivedAt: rawMessages.receivedAt,
            source: rawMessages.source,
            parserUsed: rawMessages.parserUsed,
          })
          .from(rawMessages)
          .where(eq(rawMessages.id, tx.rawMessageId))
          .then((r) => r[0] ?? null)
      : null,
    db()
      .select()
      .from(transactionSplits)
      .where(eq(transactionSplits.transactionId, id))
      .orderBy(asc(transactionSplits.id)),
    tx.linkedTransactionId
      ? db()
          .select({
            id: transactions.id,
            type: transactions.type,
            direction: transactions.direction,
            amountRial: transactions.amountRial,
            occurredAt: transactions.occurredAt,
            cardName: cards.name,
            description: transactions.description,
          })
          .from(transactions)
          .leftJoin(cards, eq(cards.id, transactions.cardId))
          .where(eq(transactions.id, tx.linkedTransactionId))
          .then((r) => r[0] ?? null)
      : null,
  ]);
  return { tx, raw, splits, linked };
}
export type TransactionDetail = NonNullable<Awaited<ReturnType<typeof getTransactionDetail>>>;

export async function listSavedViews() {
  return db().select().from(savedViews).orderBy(asc(savedViews.name));
}

/** Distinct tags in use, most frequent first (for filter suggestions). */
export async function listTags(limit = 50): Promise<string[]> {
  const rows = await db().execute<{ tag: string }>(
    sql`select tag from (select unnest(${transactions.tags}) as tag from ${transactions}) t group by tag order by count(*) desc, tag limit ${limit}`,
  );
  return rows.map((r) => r.tag);
}
