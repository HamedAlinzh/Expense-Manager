"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { categories, savedViews, transactions, transactionSplits } from "@/db/schema";
import {
  bulkUpdateSchema,
  createTransactionSchema,
  savedViewSchema,
  splitsSchema,
  updateTransactionSchema,
} from "@/lib/schemas/transaction";
import { idSchema } from "@/lib/validation";
import { defineAction, UserError } from "@/server/action-utils";
import {
  assertCategoryFits,
  createRuleFromSuggestionCore,
  createTransactionCore,
  deleteTransactionCore,
  updateTransactionCore,
} from "@/server/services/transactions";
import { getTransactionDetail } from "@/server/queries/transactions";

export const createTransaction = defineAction(createTransactionSchema, (input) =>
  createTransactionCore(input, "manual"),
);

export type { RuleSuggestion } from "@/server/services/transactions";

export const updateTransaction = defineAction(updateTransactionSchema, (input) => updateTransactionCore(input));

export const deleteTransaction = defineAction(z.object({ id: idSchema }), ({ id }) => deleteTransactionCore(id));

export const setSplits = defineAction(splitsSchema, async ({ id, splits }) => {
  const [tx] = await db().select().from(transactions).where(eq(transactions.id, id));
  if (!tx) throw new UserError("Transaction not found");
  if (tx.type === "transfer") throw new UserError("Transfers can't be split");
  if (splits.length === 1) throw new UserError("A split needs at least two parts");
  if (splits.length > 0) {
    const sum = splits.reduce((s, p) => s + p.amountRial, 0);
    if (sum !== tx.amountRial) throw new UserError("Split amounts must add up to the transaction amount");
    for (const s of splits) await assertCategoryFits(s.categoryId, tx.type);
  }
  await db().transaction(async (t) => {
    await t.delete(transactionSplits).where(eq(transactionSplits.transactionId, id));
    if (splits.length)
      await t.insert(transactionSplits).values(splits.map((s) => ({ ...s, transactionId: id, note: s.note || null })));
  });
});

export const bulkUpdate = defineAction(bulkUpdateSchema, async ({ ids, action }) => {
  const d = db();
  switch (action.kind) {
    case "category": {
      if (action.categoryId !== null) {
        const [c] = await d
          .select({ kind: categories.kind })
          .from(categories)
          .where(eq(categories.id, action.categoryId));
        if (!c) throw new UserError("Category not found");
        const wantedTypes = c.kind === "expense" ? ["expense"] : ["income", "refund"];
        const res = await d
          .update(transactions)
          .set({ categoryId: action.categoryId })
          .where(
            and(
              inArray(transactions.id, ids),
              inArray(transactions.type, wantedTypes as ("expense" | "income" | "refund")[]),
            ),
          )
          .returning({ id: transactions.id });
        return { updated: res.length, skipped: ids.length - res.length };
      }
      const res = await d
        .update(transactions)
        .set({ categoryId: null })
        .where(and(inArray(transactions.id, ids), sql`${transactions.type} <> 'transfer'`))
        .returning({ id: transactions.id });
      return { updated: res.length, skipped: ids.length - res.length };
    }
    case "addTags": {
      const res = await d
        .update(transactions)
        .set({
          tags: sql`(select coalesce(array_agg(distinct t), '{}') from unnest(${transactions.tags} || ${sql.param(action.tags)}::text[]) t)`,
        })
        .where(inArray(transactions.id, ids))
        .returning({ id: transactions.id });
      return { updated: res.length, skipped: 0 };
    }
    case "removeTags": {
      const res = await d
        .update(transactions)
        .set({
          tags: sql`(select coalesce(array_agg(t), '{}') from unnest(${transactions.tags}) t where t <> all(${sql.param(action.tags)}::text[]))`,
        })
        .where(inArray(transactions.id, ids))
        .returning({ id: transactions.id });
      return { updated: res.length, skipped: 0 };
    }
    case "confirm": {
      const res = await d
        .update(transactions)
        .set({ status: "confirmed" })
        .where(inArray(transactions.id, ids))
        .returning({ id: transactions.id });
      return { updated: res.length, skipped: 0 };
    }
    case "delete": {
      return d.transaction(async (tx) => {
        const partners = await tx
          .select({ linked: transactions.linkedTransactionId })
          .from(transactions)
          .where(and(inArray(transactions.id, ids), eq(transactions.type, "transfer")));
        const all = [...new Set([...ids, ...partners.map((p) => p.linked).filter((x): x is number => x !== null)])];
        await tx
          .update(transactions)
          .set({ linkedTransactionId: null })
          .where(
            and(
              inArray(transactions.linkedTransactionId, all),
              sql`${transactions.id} <> all(${sql.param(all)}::int[])`,
            ),
          );
        const res = await tx
          .delete(transactions)
          .where(inArray(transactions.id, all))
          .returning({ id: transactions.id });
        return { updated: res.length, skipped: 0 };
      });
    }
  }
});

/** "Always categorize X as Y": creates a merchant rule and applies it to existing uncategorized matches. */
export const createRuleFromSuggestion = defineAction(
  z.object({ pattern: z.string().trim().min(2).max(60), categoryId: idSchema }),
  ({ pattern, categoryId }) => createRuleFromSuggestionCore(pattern, categoryId),
);

export const fetchTransactionDetail = defineAction(z.object({ id: idSchema }), async ({ id }) => {
  const detail = await getTransactionDetail(id);
  if (!detail) throw new UserError("Transaction not found");
  return detail;
});

export const createSavedView = defineAction(savedViewSchema, async ({ name, query }) => {
  const [row] = await db().insert(savedViews).values({ name, filters: { query } }).returning({ id: savedViews.id });
  return { id: row!.id };
});

export const deleteSavedView = defineAction(z.object({ id: idSchema }), async ({ id }) => {
  await db().delete(savedViews).where(eq(savedViews.id, id));
});
