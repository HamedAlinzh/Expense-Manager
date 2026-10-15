import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { cards, categories, categoryRules, transactions, transactionSplits } from "@/db/schema";
import { txFingerprint } from "@/lib/dedupe";
import { cleanDisplayText, normalizeText } from "@/lib/format/text";
import { parseDayKey, tehranWallTimeToUtc } from "@/lib/format/time";
import { applyRules, matchesRule } from "@/lib/rules";
import {
  type CreateTransactionInput,
  createTransactionSchema,
  directionOf,
  type UpdateTransactionInput,
  updateTransactionSchema,
} from "@/lib/schemas/transaction";
import { UserError } from "@/server/errors";
import { loadRuleSet } from "@/server/queries/categories";
import type { z } from "zod";

/**
 * Transaction operations shared by the web app (server actions, session-checked) and the
 * Telegram bot (user-ID-checked). Callers authenticate; these functions validate data.
 */

type CreateInput = z.output<typeof createTransactionSchema>;
type UpdateInput = z.output<typeof updateTransactionSchema>;
export type { CreateTransactionInput, UpdateTransactionInput };

export async function assertCardExists(id: number | null) {
  if (id === null) return;
  const [c] = await db().select({ id: cards.id }).from(cards).where(eq(cards.id, id));
  if (!c) throw new UserError("Card not found");
}

export async function assertCategoryFits(categoryId: number | null, type: "expense" | "income" | "refund") {
  if (categoryId === null) return;
  const [c] = await db().select({ kind: categories.kind }).from(categories).where(eq(categories.id, categoryId));
  if (!c) throw new UserError("Category not found");
  const wanted = type === "expense" ? "expense" : "income";
  if (c.kind !== wanted) throw new UserError(`Pick an ${wanted} category for this ${type}`);
}

function toInstant(date: string, time: string): Date {
  const d = parseDayKey(date)!;
  const [hour, minute] = time.split(":").map(Number);
  return tehranWallTimeToUtc({ ...d, hour, minute });
}

export async function createTransactionCore(input: CreateInput, source: "manual" | "telegram" = "manual") {
  const occurredAt = toInstant(input.date, input.time);
  const description = cleanDisplayText(input.description);
  const common = {
    amountRial: input.amountRial,
    occurredAt,
    description,
    tags: input.tags,
    note: input.note || null,
    source,
    status: "confirmed" as const,
  };

  if (input.type === "transfer") {
    await assertCardExists(input.fromCardId);
    await assertCardExists(input.toCardId);
    return db().transaction(async (tx) => {
      const [out] = await tx
        .insert(transactions)
        .values({
          ...common,
          type: "transfer",
          direction: "out",
          cardId: input.fromCardId,
          dedupeHash: txFingerprint(input.fromCardId, "out", input.amountRial, occurredAt),
        })
        .returning({ id: transactions.id });
      const [inn] = await tx
        .insert(transactions)
        .values({
          ...common,
          type: "transfer",
          direction: "in",
          cardId: input.toCardId,
          linkedTransactionId: out!.id,
          dedupeHash: txFingerprint(input.toCardId, "in", input.amountRial, occurredAt),
        })
        .returning({ id: transactions.id });
      await tx.update(transactions).set({ linkedTransactionId: inn!.id }).where(eq(transactions.id, out!.id));
      return { id: out!.id, categoryId: null, autoCategorized: false };
    });
  }

  await assertCardExists(input.cardId);
  let { type } = input;
  let categoryId = input.categoryId;
  let autoCategorized = false;
  if (categoryId === null && description) {
    const hit = applyRules(await loadRuleSet(), { description, merchant: input.merchant }, type);
    if (hit) {
      categoryId = hit.categoryId;
      if (hit.setType && hit.setType !== "transfer") type = hit.setType;
      autoCategorized = true;
    }
  }
  await assertCategoryFits(categoryId, type);
  const direction = directionOf(type);
  const [row] = await db()
    .insert(transactions)
    .values({
      ...common,
      type,
      direction,
      cardId: input.cardId,
      categoryId,
      merchant: input.merchant ? cleanDisplayText(input.merchant) : null,
      dedupeHash: txFingerprint(input.cardId, direction, input.amountRial, occurredAt),
    })
    .returning({ id: transactions.id });
  return { id: row!.id, categoryId, autoCategorized };
}

/** Suggestion shown after a manual recategorization: "Always categorize 'X' as Y?" */
export type RuleSuggestion = { pattern: string; matchField: "merchant"; categoryId: number; categoryName: string };

export async function ruleSuggestion(text: string, categoryId: number): Promise<RuleSuggestion | null> {
  const pattern = text.trim();
  if (pattern.length < 2 || pattern.length > 60) return null;
  const [cat] = await db().select({ name: categories.name }).from(categories).where(eq(categories.id, categoryId));
  if (!cat) return null;
  const rules = await db().select().from(categoryRules).where(eq(categoryRules.enabled, true));
  // Skip if an existing rule already sends this text to the same category.
  if (rules.some((r) => r.categoryId === categoryId && matchesRule(r, { merchant: pattern, description: pattern })))
    return null;
  return { pattern, matchField: "merchant", categoryId, categoryName: cat.name };
}

export async function updateTransactionCore({ id, patch }: UpdateInput) {
  const [current] = await db().select().from(transactions).where(eq(transactions.id, id));
  if (!current) throw new UserError("Transaction not found");
  const isTransfer = current.type === "transfer";
  if (isTransfer && (patch.type || patch.categoryId !== undefined))
    throw new UserError("Transfers between your cards don't have a type or category");

  const type = patch.type ?? (isTransfer ? null : (current.type as Exclude<typeof current.type, "transfer">));
  if (patch.cardId !== undefined) await assertCardExists(patch.cardId);
  if (type && (patch.categoryId !== undefined || patch.type)) {
    const categoryId = patch.categoryId !== undefined ? patch.categoryId : current.categoryId;
    if (patch.type && patch.categoryId === undefined && categoryId !== null) {
      // Changing expense ⇄ income keeps the category only if it still fits.
      const [c] = await db().select({ kind: categories.kind }).from(categories).where(eq(categories.id, categoryId));
      if (c && c.kind !== (type === "expense" ? "expense" : "income")) patch.categoryId = null;
    } else {
      await assertCategoryFits(categoryId, type);
    }
  }

  const occurredAt = patch.date && patch.time ? toInstant(patch.date, patch.time) : undefined;
  const set: Partial<typeof transactions.$inferInsert> = {};
  if (patch.type) {
    set.type = patch.type;
    set.direction = directionOf(patch.type);
  }
  if (patch.amountRial !== undefined) set.amountRial = patch.amountRial;
  if (occurredAt) set.occurredAt = occurredAt;
  if (patch.cardId !== undefined) set.cardId = patch.cardId;
  if (patch.categoryId !== undefined) set.categoryId = patch.categoryId;
  if (patch.description !== undefined) set.description = cleanDisplayText(patch.description);
  if (patch.merchant !== undefined) set.merchant = patch.merchant ? cleanDisplayText(patch.merchant) : null;
  if (patch.tags !== undefined) set.tags = patch.tags;
  if (patch.note !== undefined) set.note = patch.note || null;
  if (patch.status !== undefined) set.status = patch.status;

  const amountChanged = set.amountRial !== undefined && set.amountRial !== current.amountRial;
  await db().transaction(async (tx) => {
    await tx.update(transactions).set(set).where(eq(transactions.id, id));
    // Keep both halves of a transfer consistent.
    if (isTransfer && current.linkedTransactionId) {
      const mirror: Partial<typeof transactions.$inferInsert> = {};
      if (set.amountRial !== undefined) mirror.amountRial = set.amountRial;
      if (set.occurredAt) mirror.occurredAt = set.occurredAt;
      if (set.description !== undefined) mirror.description = set.description;
      if (Object.keys(mirror).length)
        await tx.update(transactions).set(mirror).where(eq(transactions.id, current.linkedTransactionId));
    }
    // Splits no longer add up after an amount change; drop them rather than keep inconsistent data.
    if (amountChanged) await tx.delete(transactionSplits).where(eq(transactionSplits.transactionId, id));
  });

  const categoryChanged =
    patch.categoryId !== undefined && patch.categoryId !== null && patch.categoryId !== current.categoryId;
  const suggestion = categoryChanged
    ? await ruleSuggestion(current.merchant || current.description, patch.categoryId!)
    : null;
  return { suggestion, splitsCleared: amountChanged };
}

export async function deleteTransactionCore(id: number) {
  const [current] = await db()
    .select({ linked: transactions.linkedTransactionId, type: transactions.type })
    .from(transactions)
    .where(eq(transactions.id, id));
  if (!current) throw new UserError("Transaction not found");
  await db().transaction(async (tx) => {
    const ids = current.type === "transfer" && current.linked ? [id, current.linked] : [id];
    // Unlink anything (e.g. refunds) pointing at these rows first.
    await tx
      .update(transactions)
      .set({ linkedTransactionId: null })
      .where(
        and(inArray(transactions.linkedTransactionId, ids), sql`${transactions.id} <> all(${sql.param(ids)}::int[])`),
      );
    await tx.delete(transactions).where(inArray(transactions.id, ids));
  });
}

/** "Always categorize X as Y": creates a merchant rule and applies it to existing uncategorized matches. */
export async function createRuleFromSuggestionCore(pattern: string, categoryId: number) {
  const [row] = await db()
    .insert(categoryRules)
    .values({ matchField: "merchant", matchType: "contains", pattern, categoryId, priority: 100, enabled: true })
    .returning({ id: categoryRules.id });
  const [cat] = await db().select({ kind: categories.kind }).from(categories).where(eq(categories.id, categoryId));
  const types = cat?.kind === "income" ? (["income", "refund"] as const) : (["expense"] as const);
  const needle = normalizeText(pattern);
  const candidates = await db()
    .select({ id: transactions.id, description: transactions.description, merchant: transactions.merchant })
    .from(transactions)
    .where(and(sql`${transactions.categoryId} is null`, inArray(transactions.type, [...types])));
  const ids = candidates.filter((c) => normalizeText(c.merchant || c.description).includes(needle)).map((c) => c.id);
  if (ids.length) await db().update(transactions).set({ categoryId }).where(inArray(transactions.id, ids));
  return { ruleId: row!.id, applied: ids.length };
}
