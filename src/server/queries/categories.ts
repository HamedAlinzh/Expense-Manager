import "server-only";
import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { type Category, categories, categoryRules, rawMessages, transactions } from "@/db/schema";
import type { RuleLike } from "@/lib/rules";

export type CategoryWithUsage = Category & { txCount: number };

export async function listCategories(opts: { includeArchived?: boolean } = {}): Promise<Category[]> {
  return db()
    .select()
    .from(categories)
    .where(opts.includeArchived ? undefined : eq(categories.archived, false))
    .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name));
}

export async function listCategoriesWithUsage(): Promise<CategoryWithUsage[]> {
  const usage = db()
    .select({ categoryId: transactions.categoryId, n: sql<number>`count(*)::int`.as("n") })
    .from(transactions)
    .groupBy(transactions.categoryId)
    .as("usage");
  const rows = await db()
    .select({ category: categories, n: usage.n })
    .from(categories)
    .leftJoin(usage, eq(usage.categoryId, categories.id))
    .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.name));
  return rows.map((r) => ({ ...r.category, txCount: r.n ?? 0 }));
}

export type RuleRow = typeof categoryRules.$inferSelect;

export async function listRules(): Promise<RuleRow[]> {
  return db().select().from(categoryRules).orderBy(asc(categoryRules.priority), asc(categoryRules.id));
}

/** Rules joined with their category kind, ready for `applyRules`. */
export async function loadRuleSet(): Promise<RuleLike[]> {
  const rows = await db()
    .select({ rule: categoryRules, kind: categories.kind })
    .from(categoryRules)
    .innerJoin(categories, eq(categories.id, categoryRules.categoryId))
    .where(eq(categoryRules.enabled, true));
  return rows.map(({ rule, kind }) => ({ ...rule, categoryKind: kind }));
}

/** Recent transactions with the text fields rules look at (for previews and bulk re-application). */
export async function ruleCandidates(limit = 5000) {
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
      rawText: rawMessages.body,
    })
    .from(transactions)
    .leftJoin(rawMessages, eq(rawMessages.id, transactions.rawMessageId))
    .orderBy(desc(transactions.occurredAt))
    .limit(limit);
}
