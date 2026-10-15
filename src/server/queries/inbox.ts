import "server-only";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { rawMessages, transactions } from "@/db/schema";

export async function inboxCounts(): Promise<{ pending: number; unparsed: number; total: number }> {
  const [[tx], [raw]] = await Promise.all([
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.status, "pending_review")),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(rawMessages)
      .where(inArray(rawMessages.parseStatus, ["needs_review", "failed"])),
  ]);
  const pending = tx?.n ?? 0;
  const unparsed = raw?.n ?? 0;
  return { pending, unparsed, total: pending + unparsed };
}

export async function pendingTransactions(limit = 200) {
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
      source: transactions.source,
      confidence: transactions.confidence,
      rawBody: rawMessages.body,
      rawSender: rawMessages.sender,
      notes: sql<string[] | null>`${rawMessages.parseResult}->'notes'`,
    })
    .from(transactions)
    .leftJoin(rawMessages, eq(rawMessages.id, transactions.rawMessageId))
    .where(eq(transactions.status, "pending_review"))
    .orderBy(desc(transactions.occurredAt))
    .limit(limit);
}

export async function unparsedMessages(limit = 200) {
  return db()
    .select()
    .from(rawMessages)
    .where(inArray(rawMessages.parseStatus, ["needs_review", "failed"]))
    .orderBy(desc(rawMessages.receivedAt))
    .limit(limit);
}

export async function ignoredMessages(limit = 100) {
  return db()
    .select()
    .from(rawMessages)
    .where(eq(rawMessages.parseStatus, "ignored"))
    .orderBy(desc(rawMessages.receivedAt))
    .limit(limit);
}

export type PendingTx = Awaited<ReturnType<typeof pendingTransactions>>[number];
export type RawMessageRow = Awaited<ReturnType<typeof unparsedMessages>>[number];
