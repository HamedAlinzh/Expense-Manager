import "server-only";
import { createHash } from "node:crypto";
import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { type Card, cards, rawMessages, settings, transactions } from "@/db/schema";
import { txFingerprint } from "@/lib/dedupe";
import { cleanDisplayText } from "@/lib/format/text";
import { checkBalance, matchCard } from "@/lib/ingest/match";
import { normalizeSender, normalizeSmsBody, senderMatches } from "@/lib/ingest/normalize";
import { type ParseResult, parseMessage } from "@/lib/ingest/parsers";
import { detectOtp, maskCardNumbers } from "@/lib/ingest/security";
import { errorMessage, log } from "@/lib/logger";
import { applyRules } from "@/lib/rules";
import { loadRuleSet } from "@/server/queries/categories";
import { aiParse } from "./ai-parser";

export type IngestSource = "sms" | "notification" | "telegram";

export type IngestInput = {
  source: IngestSource;
  sender: string;
  body: string;
  receivedAt: Date;
};

export type IngestOutcome =
  | { status: "duplicate"; rawMessageId: number }
  | { status: "ignored"; rawMessageId: number; reason: string }
  | { status: "needs_review"; rawMessageId: number; reason: string }
  | {
      status: "created";
      rawMessageId: number;
      transactionId: number;
      txStatus: "confirmed" | "pending_review";
      transfer: boolean;
    }
  | { status: "matched"; rawMessageId: number; transactionId: number }
  | { status: "failed"; rawMessageId: number; error: string };

/** Confidence at or above which a parsed transaction with a matched card is auto-confirmed. */
export const AUTO_CONFIRM = 0.9;
/** Below this, regular parsers are considered to have failed (AI fallback, then review). */
const MIN_PARSER_CONFIDENCE = 0.5;

const BANK_LIKE = /مانده|موجودی|ریال|تومان|برداشت|واریز|خرید|بانک|حساب|کارت|\b(?:bank|balance|debit|credit)\b/i;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function contentHash(input: IngestInput, isOtp: boolean): string {
  // OTP bodies never enter the hash: a hash of a 6-digit code is trivially reversible.
  const body = isOtp ? "<otp>" : input.body;
  return sha256(`${input.source}|${normalizeSender(input.sender)}|${body}|${input.receivedAt.toISOString()}`);
}

/**
 * Entry point for every message source (SMS endpoint, notifications, Telegram forwards).
 * Idempotent: the same source+sender+body+received_at is stored once.
 */
export async function ingestMessage(input: IngestInput): Promise<IngestOutcome> {
  const d = db();
  const otp = detectOtp(input.body);
  const hash = contentHash(input, otp.isOtp);
  const [existing] = await d.select({ id: rawMessages.id }).from(rawMessages).where(eq(rawMessages.contentHash, hash));
  if (existing) return { status: "duplicate", rawMessageId: existing.id };

  const insertRaw = async (values: Partial<typeof rawMessages.$inferInsert>) => {
    const [row] = await d
      .insert(rawMessages)
      .values({
        source: input.source,
        sender: input.sender.slice(0, 100),
        receivedAt: input.receivedAt,
        contentHash: hash,
        parseStatus: "needs_review",
        ...values,
      })
      .onConflictDoNothing({ target: rawMessages.contentHash })
      .returning({ id: rawMessages.id });
    return row?.id ?? null;
  };

  if (otp.isOtp) {
    const id = await insertRaw({ body: null, parseStatus: "ignored", error: "otp_discarded" });
    log.info("ingest: OTP discarded", { rawId: id, source: input.source });
    return id ? { status: "ignored", rawMessageId: id, reason: "otp" } : await raceDuplicate(hash);
  }

  const { text: body, masked } = maskCardNumbers(input.body);
  if (masked) log.info("ingest: masked full card numbers", { count: masked });

  // Sender allowlist (Telegram forwards are already authenticated by user ID).
  if (input.source !== "telegram") {
    const allCards = await d.select({ smsSenderIds: cards.smsSenderIds }).from(cards).where(eq(cards.archived, false));
    const known = allCards.some((c) => c.smsSenderIds.some((s) => senderMatches(input.sender, s)));
    if (!known) {
      // Keep the text only if it looks like a bank message (needed for "Add sender to card");
      // personal messages forwarded by a misconfigured phone are recorded without their content.
      const bankLike = BANK_LIKE.test(normalizeSmsBody(body));
      const id = await insertRaw({
        body: bankLike ? body : null,
        parseStatus: "ignored",
        error: bankLike ? "unknown_sender" : "unknown_sender_not_bank",
      });
      log.info("ingest: unknown sender ignored", { rawId: id, source: input.source });
      return id ? { status: "ignored", rawMessageId: id, reason: "unknown_sender" } : await raceDuplicate(hash);
    }
  }

  const rawId = await insertRaw({ body });
  if (!rawId) return raceDuplicate(hash);
  return processRawMessage(rawId);
}

async function raceDuplicate(hash: string): Promise<IngestOutcome> {
  const [row] = await db().select({ id: rawMessages.id }).from(rawMessages).where(eq(rawMessages.contentHash, hash));
  return { status: "duplicate", rawMessageId: row?.id ?? 0 };
}

type Settings = typeof settings.$inferSelect;

/**
 * Parses a stored raw message and creates/matches its transaction. Safe to re-run on
 * needs_review messages after adjusting cards or parsers ("Re-parse" in the inbox).
 */
export async function processRawMessage(rawId: number, opts: { allowAi?: boolean } = {}): Promise<IngestOutcome> {
  const d = db();
  const [raw] = await d.select().from(rawMessages).where(eq(rawMessages.id, rawId));
  if (!raw || raw.body === null) return { status: "failed", rawMessageId: rawId, error: "message body not available" };

  const markRaw = (values: Partial<typeof rawMessages.$inferInsert>) =>
    d.update(rawMessages).set(values).where(eq(rawMessages.id, rawId));

  try {
    const [cfg] = await d.select().from(settings).where(eq(settings.id, 1));
    const activeCards = await d.select().from(cards).where(eq(cards.archived, false)).orderBy(asc(cards.sortOrder));
    const senderCards =
      raw.source === "telegram"
        ? []
        : activeCards.filter((c) => c.smsSenderIds.some((s) => senderMatches(raw.sender, s)));
    const ctx = {
      receivedAt: raw.receivedAt,
      sender: raw.sender,
      bankHints: [...new Set(senderCards.map((c) => c.bank))],
    };

    let parsed = parseMessage(raw.body, ctx);
    if ((!parsed || parsed.confidence < MIN_PARSER_CONFIDENCE) && opts.allowAi !== false) {
      parsed = (await aiParse(raw.body, ctx)) ?? parsed;
    }
    if (!parsed || parsed.confidence < 0.3) {
      await markRaw({
        parseStatus: "needs_review",
        parserUsed: parsed?.parser ?? null,
        parseResult: parsed ? serialize(parsed) : null,
        error: "no transaction recognised",
      });
      log.info("ingest: needs review", { rawId, reason: "unparsed" });
      return { status: "needs_review", rawMessageId: rawId, reason: "unparsed" };
    }

    // Card: sender's cards first; for Telegram forwards, cards of the detected bank.
    const pool = senderCards.length
      ? senderCards
      : parsed.bank
        ? activeCards.filter((c) => c.bank === parsed!.bank)
        : [];
    const match = matchCard(pool, parsed.identifier);
    const card = match.card;
    let confidence = parsed.confidence - match.penalty;
    const notes = [...parsed.notes];
    if (match.how === "learned") notes.push(`learned identifier ${match.learn} for ${card!.name}`);
    if (!card) notes.push(match.how === "ambiguous" ? "several cards could match" : "no card matched");

    // Balance continuity can confirm (or correct) the direction.
    let type = parsed.type;
    if (card) {
      const prev =
        card.lastKnownBalanceRial !== null && card.balanceUpdatedAt
          ? { balanceRial: card.lastKnownBalanceRial, at: card.balanceUpdatedAt }
          : null;
      const check = checkBalance(prev, { ...parsed, type });
      if (check === "consistent") {
        confidence = Math.min(1, confidence + 0.15);
        notes.push("balance confirms direction");
      } else if (check === "flipped") {
        type = type === "expense" ? "income" : "expense";
        confidence = Math.max(confidence, AUTO_CONFIRM);
        notes.push("direction corrected by balance");
      }
    }
    confidence = Math.round(Math.max(0, confidence) * 100) / 100;
    const final: ParseResult = { ...parsed, type, confidence, notes };
    const direction = type === "expense" ? "out" : "in";

    // Same money already recorded (another channel, a manual entry, or an import)?
    const dupe = await findExisting(final, card, direction, cfg);
    if (dupe) {
      const reconcile = !dupe.rawMessageId; // manual/CSV entry gets enriched by the bank's data
      await d
        .update(transactions)
        .set({
          reconciledAt: new Date(),
          ...(reconcile ? { rawMessageId: rawId } : {}),
          ...(dupe.cardId === null && card ? { cardId: card.id } : {}),
          ...(dupe.balanceAfterRial === null && final.balanceAfterRial !== null
            ? { balanceAfterRial: final.balanceAfterRial }
            : {}),
        })
        .where(eq(transactions.id, dupe.id));
      await markRaw({
        parseStatus: "parsed",
        parserUsed: final.parser,
        parseResult: { ...serialize(final), matchedTransactionId: dupe.id },
        error: null,
      });
      if (card) await afterCardActivity(card, final, match.learn);
      log.info("ingest: matched existing transaction", { rawId, transactionId: dupe.id });
      return { status: "matched", rawMessageId: rawId, transactionId: dupe.id };
    }

    // Categorize with rules (merchant → description → raw text).
    const rules = await loadRuleSet();
    const hit = applyRules(
      rules,
      { merchant: final.merchant, description: final.description, rawText: raw.body },
      type,
    );
    const finalType = hit?.setType && hit.setType !== "transfer" ? hit.setType : type;
    const finalDirection = finalType === "expense" ? "out" : "in";
    const txStatus = card && confidence >= AUTO_CONFIRM ? "confirmed" : "pending_review";

    const [created] = await d
      .insert(transactions)
      .values({
        cardId: card?.id ?? null,
        type: finalType,
        direction: finalDirection,
        amountRial: final.amountRial,
        occurredAt: final.occurredAt,
        description: cleanDisplayText(final.description),
        merchant: final.merchant,
        categoryId: hit?.categoryId ?? null,
        source: raw.source === "notification" ? "notification" : raw.source === "telegram" ? "telegram" : "sms",
        status: txStatus,
        rawMessageId: rawId,
        balanceAfterRial: final.balanceAfterRial,
        confidence,
        dedupeHash: txFingerprint(card?.id ?? null, finalDirection, final.amountRial, final.occurredAt),
      })
      .returning({ id: transactions.id });

    const transfer = card ? await pairTransfer(created!.id, card.id, finalDirection, final, cfg) : false;
    if (card) await afterCardActivity(card, final, match.learn);
    await markRaw({ parseStatus: "parsed", parserUsed: final.parser, parseResult: serialize(final), error: null });
    log.info("ingest: created transaction", {
      rawId,
      transactionId: created!.id,
      status: txStatus,
      parser: final.parser,
      confidence,
      card: card?.id ?? null,
      transfer,
    });
    log.debug("ingest: details", { amountRial: final.amountRial, type: finalType });
    return { status: "created", rawMessageId: rawId, transactionId: created!.id, txStatus, transfer };
  } catch (err) {
    await markRaw({ parseStatus: "failed", error: errorMessage(err).slice(0, 500) });
    log.error("ingest: failed", { rawId, error: errorMessage(err) });
    return { status: "failed", rawMessageId: rawId, error: "processing failed" };
  }
}

function serialize(r: ParseResult) {
  return { ...r, occurredAt: r.occurredAt.toISOString() };
}

/**
 * Looks for the same real-world transaction already recorded: same direction and amount within the
 * dedupe window, on the same card (or a card-less manual entry). Two bank messages with different
 * balances are distinct purchases, never duplicates.
 */
async function findExisting(p: ParseResult, card: Card | null, direction: "in" | "out", cfg: Settings | undefined) {
  const windowMs = (cfg?.dedupeWindowMinutes ?? 10) * 60_000;
  const from = new Date(p.occurredAt.getTime() - windowMs);
  const to = new Date(p.occurredAt.getTime() + windowMs);
  const candidates = await db()
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.amountRial, p.amountRial),
        eq(transactions.direction, direction),
        gte(transactions.occurredAt, from),
        lte(transactions.occurredAt, to),
        card ? or(eq(transactions.cardId, card.id), isNull(transactions.cardId)) : isNull(transactions.cardId),
      ),
    );
  const viable = candidates.filter(
    (c) => !(c.balanceAfterRial !== null && p.balanceAfterRial !== null && c.balanceAfterRial !== p.balanceAfterRial),
  );
  viable.sort(
    (a, b) =>
      Math.abs(a.occurredAt.getTime() - p.occurredAt.getTime()) -
      Math.abs(b.occurredAt.getTime() - p.occurredAt.getTime()),
  );
  return viable[0] ?? null;
}

/**
 * An expense on one of my cards and an equal income on another within the transfer window is a
 * transfer between my own cards: both become `transfer`, are linked, and drop out of totals.
 */
async function pairTransfer(
  txId: number,
  cardId: number,
  direction: "in" | "out",
  p: ParseResult,
  cfg: Settings | undefined,
): Promise<boolean> {
  const windowMs = (cfg?.transferWindowMinutes ?? 5) * 60_000;
  const [other] = await db()
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        ne(transactions.id, txId),
        eq(transactions.amountRial, p.amountRial),
        eq(transactions.direction, direction === "out" ? "in" : "out"),
        inArray(transactions.type, direction === "out" ? ["income"] : ["expense"]),
        ne(transactions.cardId, cardId),
        sql`${transactions.cardId} is not null`,
        isNull(transactions.linkedTransactionId),
        gte(transactions.occurredAt, new Date(p.occurredAt.getTime() - windowMs)),
        lte(transactions.occurredAt, new Date(p.occurredAt.getTime() + windowMs)),
      ),
    )
    .orderBy(sql`abs(extract(epoch from ${transactions.occurredAt} - ${p.occurredAt.toISOString()}::timestamptz))`)
    .limit(1);
  if (!other) return false;
  await db().transaction(async (tx) => {
    await tx
      .update(transactions)
      .set({ type: "transfer", categoryId: null, linkedTransactionId: other.id })
      .where(eq(transactions.id, txId));
    await tx
      .update(transactions)
      .set({ type: "transfer", categoryId: null, linkedTransactionId: txId })
      .where(eq(transactions.id, other.id));
  });
  return true;
}

/** Keeps the card's latest balance and learned identifiers up to date. */
async function afterCardActivity(card: Card, p: ParseResult, learn: string | null) {
  const set: Partial<typeof cards.$inferInsert> = {};
  if (
    p.balanceAfterRial !== null &&
    (!card.balanceUpdatedAt || p.occurredAt.getTime() >= card.balanceUpdatedAt.getTime())
  ) {
    set.lastKnownBalanceRial = p.balanceAfterRial;
    set.balanceUpdatedAt = p.occurredAt;
  }
  // Never learn an unmasked full card number (masking normally removes them before this point).
  if (learn && !card.identifierFragments.includes(learn) && !/^\d{16,}$/.test(learn)) {
    set.identifierFragments = [...card.identifierFragments, learn].slice(-20);
  }
  if (Object.keys(set).length) await db().update(cards).set(set).where(eq(cards.id, card.id));
}
