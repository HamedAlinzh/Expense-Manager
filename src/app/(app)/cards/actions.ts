"use server";

import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cards, settings, transactions } from "@/db/schema";
import { cardInputSchema } from "@/lib/schemas/card";
import { idSchema } from "@/lib/validation";
import { defineAction, UserError } from "@/server/action-utils";

export const createCard = defineAction(cardInputSchema, async (input) => {
  const [{ max } = { max: 0 }] = await db()
    .select({ max: sql<number>`coalesce(max(${cards.sortOrder}), 0)::int` })
    .from(cards);
  const [card] = await db()
    .insert(cards)
    .values({
      ...input,
      sortOrder: max + 1,
      balanceUpdatedAt: input.lastKnownBalanceRial !== null ? new Date() : null,
    })
    .returning({ id: cards.id });
  return { id: card!.id };
});

export const updateCard = defineAction(z.object({ id: idSchema, data: cardInputSchema }), async ({ id, data }) => {
  const [current] = await db().select({ balance: cards.lastKnownBalanceRial }).from(cards).where(eq(cards.id, id));
  if (!current) throw new UserError("Card not found");
  const balanceChanged = current.balance !== data.lastKnownBalanceRial;
  await db()
    .update(cards)
    .set({
      ...data,
      ...(balanceChanged ? { balanceUpdatedAt: data.lastKnownBalanceRial === null ? null : new Date() } : {}),
    })
    .where(eq(cards.id, id));
});

export const setCardArchived = defineAction(
  z.object({ id: idSchema, archived: z.boolean() }),
  async ({ id, archived }) => {
    await db().update(cards).set({ archived }).where(eq(cards.id, id));
  },
);

export const deleteCard = defineAction(z.object({ id: idSchema }), async ({ id }) => {
  const [{ n } = { n: 0 }] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(transactions)
    .where(eq(transactions.cardId, id));
  if (n > 0) throw new UserError(`This card has ${n} transactions. Archive it instead to keep your history.`);
  await db().transaction(async (tx) => {
    await tx.update(settings).set({ defaultCardId: null }).where(eq(settings.defaultCardId, id));
    await tx.delete(cards).where(eq(cards.id, id));
  });
});

export const reorderCards = defineAction(z.object({ ids: z.array(idSchema).max(100) }), async ({ ids }) => {
  await db().transaction(async (tx) => {
    for (const [i, id] of ids.entries())
      await tx
        .update(cards)
        .set({ sortOrder: i + 1 })
        .where(eq(cards.id, id));
  });
});
