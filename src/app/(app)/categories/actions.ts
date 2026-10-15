"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { budgets, categories, categoryRules, transactions, transactionSplits } from "@/db/schema";
import { applyRules, matchesRule } from "@/lib/rules";
import { categoryInputSchema, ruleInputSchema } from "@/lib/schemas/category";
import { idSchema } from "@/lib/validation";
import { defineAction, UserError } from "@/server/action-utils";
import { listCategories, ruleCandidates } from "@/server/queries/categories";

async function assertValidParent(parentId: number | null, kind: "expense" | "income", selfId?: number) {
  if (parentId === null) return;
  if (parentId === selfId) throw new UserError("A category can't be its own parent");
  const [parent] = await db().select().from(categories).where(eq(categories.id, parentId));
  if (!parent) throw new UserError("Parent category not found");
  if (parent.kind !== kind) throw new UserError("Parent must be the same kind (expense/income)");
  if (parent.parentId !== null) throw new UserError("Only one level of subcategories is supported");
  if (selfId !== undefined) {
    const [child] = await db()
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, selfId))
      .limit(1);
    if (child) throw new UserError("This category has subcategories, so it can't become one");
  }
}

async function assertUniqueName(name: string, kind: "expense" | "income", selfId?: number) {
  const [dupe] = await db()
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.kind, kind), sql`lower(${categories.name}) = lower(${name})`));
  if (dupe && dupe.id !== selfId) throw new UserError(`A ${kind} category named "${name}" already exists`);
}

export const createCategory = defineAction(categoryInputSchema, async (input) => {
  await assertValidParent(input.parentId, input.kind);
  await assertUniqueName(input.name, input.kind);
  const [{ max } = { max: 0 }] = await db()
    .select({ max: sql<number>`coalesce(max(${categories.sortOrder}), 0)::int` })
    .from(categories);
  const [row] = await db()
    .insert(categories)
    .values({ ...input, sortOrder: max + 1 })
    .returning({ id: categories.id });
  return { id: row!.id };
});

export const updateCategory = defineAction(
  z.object({ id: idSchema, data: categoryInputSchema }),
  async ({ id, data }) => {
    const [current] = await db().select().from(categories).where(eq(categories.id, id));
    if (!current) throw new UserError("Category not found");
    if (current.kind !== data.kind) {
      const [{ n } = { n: 0 }] = await db()
        .select({ n: sql<number>`count(*)::int` })
        .from(transactions)
        .where(eq(transactions.categoryId, id));
      if (n > 0) throw new UserError("Can't switch expense/income on a category that has transactions");
    }
    await assertValidParent(data.parentId, data.kind, id);
    await assertUniqueName(data.name, data.kind, id);
    await db().update(categories).set(data).where(eq(categories.id, id));
  },
);

export const setCategoryArchived = defineAction(
  z.object({ id: idSchema, archived: z.boolean() }),
  async ({ id, archived }) => {
    await db().update(categories).set({ archived }).where(eq(categories.id, id));
  },
);

/** Deletes a category, optionally moving its transactions, splits and budgets to another of the same kind. */
export const deleteCategory = defineAction(
  z.object({ id: idSchema, reassignTo: idSchema.nullable() }),
  async ({ id, reassignTo }) => {
    const all = await listCategories({ includeArchived: true });
    const target = all.find((c) => c.id === id);
    if (!target) throw new UserError("Category not found");
    if (reassignTo !== null) {
      const dest = all.find((c) => c.id === reassignTo);
      if (!dest || dest.kind !== target.kind || dest.id === id)
        throw new UserError("Pick another category of the same kind");
    }
    await db().transaction(async (tx) => {
      const children = all.filter((c) => c.parentId === id).map((c) => c.id);
      if (children.length) await tx.update(categories).set({ parentId: null }).where(inArray(categories.id, children));
      await tx.update(transactions).set({ categoryId: reassignTo }).where(eq(transactions.categoryId, id));
      await tx.update(transactionSplits).set({ categoryId: reassignTo }).where(eq(transactionSplits.categoryId, id));
      if (reassignTo !== null)
        await tx.update(categoryRules).set({ categoryId: reassignTo }).where(eq(categoryRules.categoryId, id));
      await tx.delete(budgets).where(eq(budgets.categoryId, id));
      await tx.delete(categories).where(eq(categories.id, id));
    });
  },
);

// ─── Rules ───────────────────────────────────────────────────────────────────

export const createRule = defineAction(ruleInputSchema, async (input) => {
  const [row] = await db().insert(categoryRules).values(input).returning({ id: categoryRules.id });
  return { id: row!.id };
});

export const updateRule = defineAction(z.object({ id: idSchema, data: ruleInputSchema }), async ({ id, data }) => {
  await db().update(categoryRules).set(data).where(eq(categoryRules.id, id));
});

export const setRuleEnabled = defineAction(
  z.object({ id: idSchema, enabled: z.boolean() }),
  async ({ id, enabled }) => {
    await db().update(categoryRules).set({ enabled }).where(eq(categoryRules.id, id));
  },
);

export const deleteRule = defineAction(z.object({ id: idSchema }), async ({ id }) => {
  await db().delete(categoryRules).where(eq(categoryRules.id, id));
});

export type RulePreviewItem = {
  id: number;
  occurredAt: string;
  description: string;
  merchant: string | null;
  amountRial: number;
  type: "expense" | "income" | "transfer" | "refund";
  direction: "in" | "out";
  categoryId: number | null;
};

/** Runs a (possibly unsaved) rule against recent transactions without changing anything. */
export const previewRule = defineAction(ruleInputSchema, async (input) => {
  const candidates = await ruleCandidates();
  const matches = candidates.filter((c) => matchesRule(input, c));
  const items: RulePreviewItem[] = matches.slice(0, 25).map((m) => ({
    id: m.id,
    occurredAt: m.occurredAt.toISOString(),
    description: m.description,
    merchant: m.merchant,
    amountRial: m.amountRial,
    type: m.type,
    direction: m.direction,
    categoryId: m.categoryId,
  }));
  return {
    total: matches.length,
    changing: matches.filter((m) => m.categoryId !== input.categoryId).length,
    scanned: candidates.length,
    items,
  };
});

/** Re-categorizes existing transactions that match this rule (only those not already in its category). */
export const applyRuleToExisting = defineAction(ruleInputSchema, async (input) => {
  const candidates = await ruleCandidates();
  const kind = (
    await db().select({ kind: categories.kind }).from(categories).where(eq(categories.id, input.categoryId))
  )[0]?.kind;
  if (!kind) throw new UserError("Category not found");
  const asRule = { ...input, id: 0, categoryKind: kind };
  const ids = candidates
    .filter((c) => c.categoryId !== input.categoryId && applyRules([asRule], c, c.type) !== null)
    .map((c) => c.id);
  if (ids.length)
    await db().update(transactions).set({ categoryId: input.categoryId }).where(inArray(transactions.id, ids));
  return { updated: ids.length };
});
