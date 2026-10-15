"use server";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { cards, rawMessages, transactions } from "@/db/schema";
import { txFingerprint } from "@/lib/dedupe";
import { cleanDisplayText } from "@/lib/format/text";
import { parseDayKey, tehranWallTimeToUtc } from "@/lib/format/time";
import { senderMatches } from "@/lib/ingest/normalize";
import { parseMessage } from "@/lib/ingest/parsers";
import { detectOtp, maskCardNumbers } from "@/lib/ingest/security";
import { directionOf } from "@/lib/schemas/transaction";
import { idSchema, positiveRialSchema, tagListSchema } from "@/lib/validation";
import { defineAction, UserError } from "@/server/action-utils";
import { processRawMessage } from "@/server/ingest/pipeline";

export const confirmTransactions = defineAction(
  z.object({ ids: z.array(idSchema).min(1).max(500) }),
  async ({ ids }) => {
    const res = await db()
      .update(transactions)
      .set({ status: "confirmed" })
      .where(inArray(transactions.id, ids))
      .returning({ id: transactions.id });
    return { confirmed: res.length };
  },
);

export const reparseMessages = defineAction(
  z.object({ ids: z.array(idSchema).max(500).optional() }),
  async ({ ids }) => {
    const targets = ids?.length
      ? ids
      : (
          await db()
            .select({ id: rawMessages.id })
            .from(rawMessages)
            .where(inArray(rawMessages.parseStatus, ["needs_review", "failed"]))
        ).map((r) => r.id);
    let created = 0;
    for (const id of targets) {
      const outcome = await processRawMessage(id);
      if (outcome.status === "created" || outcome.status === "matched") created++;
    }
    return { processed: targets.length, created };
  },
);

export const dismissMessage = defineAction(z.object({ id: idSchema }), async ({ id }) => {
  await db()
    .update(rawMessages)
    .set({ parseStatus: "ignored", error: "dismissed" })
    .where(and(eq(rawMessages.id, id), inArray(rawMessages.parseStatus, ["needs_review", "failed"])));
});

export const deleteMessage = defineAction(z.object({ id: idSchema }), async ({ id }) => {
  const [linked] = await db()
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.rawMessageId, id))
    .limit(1);
  if (linked) throw new UserError("This message belongs to a transaction; delete the transaction instead.");
  await db().delete(rawMessages).where(eq(rawMessages.id, id));
});

/** Adds an ignored message's sender to a card, then processes the message. */
export const addSenderToCard = defineAction(
  z.object({ rawId: idSchema, cardId: idSchema }),
  async ({ rawId, cardId }) => {
    const [raw] = await db().select().from(rawMessages).where(eq(rawMessages.id, rawId));
    if (!raw) throw new UserError("Message not found");
    const [card] = await db().select().from(cards).where(eq(cards.id, cardId));
    if (!card) throw new UserError("Card not found");
    if (!card.smsSenderIds.some((s) => senderMatches(raw.sender, s))) {
      await db()
        .update(cards)
        .set({ smsSenderIds: [...card.smsSenderIds.filter((s) => !s.startsWith("PLACEHOLDER")), raw.sender] })
        .where(eq(cards.id, cardId));
    }
    // Re-process every message ignored for this sender, not just this one.
    const others = await db()
      .select({ id: rawMessages.id, sender: rawMessages.sender })
      .from(rawMessages)
      .where(and(eq(rawMessages.parseStatus, "ignored"), eq(rawMessages.error, "unknown_sender")));
    const ids = others.filter((o) => senderMatches(o.sender, raw.sender)).map((o) => o.id);
    if (ids.length)
      await db()
        .update(rawMessages)
        .set({ parseStatus: "needs_review", error: null })
        .where(inArray(rawMessages.id, ids));
    let created = 0;
    for (const id of ids) {
      const o = await processRawMessage(id);
      if (o.status === "created" || o.status === "matched") created++;
    }
    return { processed: ids.length, created };
  },
);

/** Manual entry for a message the parsers couldn't read; the transaction keeps the message attached. */
export const createFromMessage = defineAction(
  z.object({
    rawId: idSchema,
    type: z.enum(["expense", "income", "refund"]),
    amountRial: positiveRialSchema,
    cardId: idSchema.nullable(),
    categoryId: idSchema.nullable(),
    date: z.string().refine((v) => parseDayKey(v) !== null),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    description: z.string().trim().max(300),
    tags: tagListSchema,
  }),
  async (input) => {
    const [raw] = await db().select().from(rawMessages).where(eq(rawMessages.id, input.rawId));
    if (!raw) throw new UserError("Message not found");
    const d = parseDayKey(input.date)!;
    const [h, m] = input.time.split(":").map(Number);
    const occurredAt = tehranWallTimeToUtc({ ...d, hour: h, minute: m });
    const direction = directionOf(input.type);
    const [tx] = await db()
      .insert(transactions)
      .values({
        type: input.type,
        direction,
        amountRial: input.amountRial,
        occurredAt,
        cardId: input.cardId,
        categoryId: input.categoryId,
        description: cleanDisplayText(input.description),
        tags: input.tags,
        source: raw.source === "notification" ? "notification" : raw.source === "telegram" ? "telegram" : "sms",
        status: "confirmed",
        rawMessageId: raw.id,
        dedupeHash: txFingerprint(input.cardId, direction, input.amountRial, occurredAt),
      })
      .returning({ id: transactions.id });
    await db()
      .update(rawMessages)
      .set({ parseStatus: "parsed", parserUsed: "manual", error: null })
      .where(eq(rawMessages.id, raw.id));
    return { id: tx!.id };
  },
);

/** Dry run: how would this text be handled? Nothing is stored. */
export const testMessage = defineAction(
  z.object({ body: z.string().min(1).max(4000), sender: z.string().max(100).optional() }),
  async ({ body, sender }) => {
    const otp = detectOtp(body);
    if (otp.isOtp) return { otp: true as const, reason: otp.reason };
    const { text, masked } = maskCardNumbers(body);
    const allCards = await db().select().from(cards).where(eq(cards.archived, false));
    const senderCards = sender ? allCards.filter((c) => c.smsSenderIds.some((s) => senderMatches(sender, s))) : [];
    const r = parseMessage(text, {
      receivedAt: new Date(),
      sender,
      bankHints: [...new Set(senderCards.map((c) => c.bank))],
    });
    return {
      otp: false as const,
      masked,
      senderKnown: sender ? senderCards.length > 0 : null,
      senderCards: senderCards.map((c) => c.name),
      result: r ? { ...r, occurredAt: r.occurredAt.toISOString() } : null,
    };
  },
);
