import "server-only";
import { desc, eq } from "drizzle-orm";
import { Bot, type BotConfig, type Context, GrammyError, InlineKeyboard } from "grammy";
import { db } from "@/db";
import { cards, transactions } from "@/db/schema";
import { dayKeyOf, tehranParts } from "@/lib/format/time";
import { parseMessage } from "@/lib/ingest/parsers";
import { errorMessage, log } from "@/lib/logger";
import { createTransactionSchema } from "@/lib/schemas/transaction";
import { esc, txLine } from "@/lib/telegram/format";
import { parseQuickEntry } from "@/lib/telegram/quick-entry";
import { UserError } from "@/server/errors";
import { ingestMessage, type IngestOutcome } from "@/server/ingest/pipeline";
import {
  createRuleFromSuggestionCore,
  createTransactionCore,
  deleteTransactionCore,
  updateTransactionCore,
} from "@/server/services/transactions";
import { getSettings } from "@/server/settings";
import {
  budgetView,
  cardPicker,
  cardsView,
  categoryPicker,
  inboxSummary,
  lastView,
  mainKeyboard,
  monthView,
  todayView,
  txView,
  weekView,
} from "./views";

const HTML = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };

export const BOT_COMMANDS = [
  { command: "today", description: "Spending today" },
  { command: "week", description: "Spending this week (since Saturday)" },
  { command: "month", description: "Spending this Jalali month" },
  { command: "budget", description: "Budget progress" },
  { command: "inbox", description: "Transactions waiting for review" },
  { command: "cards", description: "Cards and latest balances" },
  { command: "last", description: "Last 10 transactions" },
  { command: "undo", description: "Delete my last bot entry" },
  { command: "help", description: "How to use this bot" },
];

const HELP = `<b>Quick entry</b> — amount in <b>thousand Toman</b>, then what it was for, optionally a card:
<code>50 lunch</code> → 50,000 T on your default card
<code>50 ناهار ملت</code> → on Mellat
<code>۱۲۰ سوپرمارکت بلو</code> → Persian digits work
<code>+3000 salary sepah</code> → income (leading +)
<code>12.5 taxi tejarat #work</code> → decimals and #tags

<b>Bank SMS</b> — forward or paste the bank message and I'll read it like the SMS forwarder does.

<b>Commands</b>
/today /week /month — spending by category
/budget — budget progress · /cards — balances
/inbox — review uncertain transactions
/last — recent transactions · /undo — remove my last entry`;

function messageTime(ctx: Context): Date {
  return new Date((ctx.message?.date ?? Math.floor(Date.now() / 1000)) * 1000);
}

function hhmm(d: Date) {
  const p = tehranParts(d);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

async function replyTx(ctx: Context, id: number, header: string) {
  const view = await txView(id, header);
  if (view) await ctx.reply(view.text, { ...HTML, reply_markup: view.keyboard });
}

async function replyIngest(ctx: Context, outcome: IngestOutcome) {
  switch (outcome.status) {
    case "created":
      return replyTx(
        ctx,
        outcome.transactionId,
        outcome.transfer
          ? "🔁 <b>Transfer between your cards</b> recorded from the bank message"
          : "📩 <b>Read from the bank message</b>",
      );
    case "matched":
      return replyTx(ctx, outcome.transactionId, "🔗 <b>Matched an existing entry</b> — no duplicate created");
    case "duplicate":
      return ctx.reply("ℹ️ I already have this message.");
    case "ignored":
      return ctx.reply(
        outcome.reason === "otp" ? "🔒 That looks like a one-time password — discarded without saving." : "ℹ️ Ignored.",
      );
    case "needs_review":
      return ctx.reply(
        "🤔 I couldn't read that message. It's waiting in the app's Inbox so you can record it by hand.",
      );
    case "failed":
      return ctx.reply("⚠️ Something went wrong while processing that message.");
  }
}

/** Telegram text that looks like a bank SMS (multi-line or forwarded) rather than a quick entry. */
function looksLikeBankMessage(text: string, forwarded: boolean): boolean {
  if (forwarded || text.includes("\n")) return true;
  const r = parseMessage(text, { receivedAt: new Date() });
  return !!r && r.confidence >= 0.6 && (r.balanceAfterRial !== null || r.bank !== null);
}

async function handleText(ctx: Context) {
  const msg = ctx.message!;
  const text = msg.text!.trim();
  const origin = msg.forward_origin;
  const forwarded = !!origin;

  if (looksLikeBankMessage(text, forwarded)) {
    const receivedAt = origin ? new Date(origin.date * 1000) : messageTime(ctx);
    const sender =
      origin?.type === "user"
        ? `${origin.sender_user.first_name}`
        : origin?.type === "hidden_user"
          ? origin.sender_user_name
          : origin?.type === "channel"
            ? (origin.chat.title ?? "channel")
            : "telegram";
    return replyIngest(ctx, await ingestMessage({ source: "telegram", sender, body: text, receivedAt }));
  }

  const [settings, cardList] = await Promise.all([getSettings(), db().select().from(cards)]);
  const entry = parseQuickEntry(text, cardList, settings.defaultCardId);
  if (!entry) {
    return ctx.reply(
      "I didn't get that. Send an amount in thousand Toman and a description, e.g. <code>50 lunch mellat</code>. /help",
      HTML,
    );
  }
  const at = messageTime(ctx);
  const input = createTransactionSchema.parse({
    type: entry.type,
    amountRial: entry.amountRial,
    date: dayKeyOf(at),
    time: hhmm(at),
    description: entry.description,
    tags: entry.tags,
    note: null,
    cardId: entry.cardId,
    categoryId: null,
    merchant: null,
  });
  const res = await createTransactionCore(input, "telegram");
  await replyTx(ctx, res.id, entry.type === "income" ? "✅ <b>Income saved</b>" : "✅ <b>Expense saved</b>");
}

/** Telegram rejects edits that change nothing (e.g. re-picking the same category); that's not an error for us. */
async function tolerateUnchanged(p: Promise<unknown>) {
  try {
    await p;
  } catch (err) {
    if (err instanceof GrammyError && err.description.includes("message is not modified")) return;
    throw err;
  }
}

async function showMain(ctx: Context, txId: number, header?: string) {
  const view = await txView(txId, header);
  if (!view) return tolerateUnchanged(ctx.editMessageText("This transaction no longer exists."));
  await tolerateUnchanged(ctx.editMessageText(view.text, { ...HTML, reply_markup: view.keyboard }));
}

async function handleCallback(ctx: Context) {
  const data = ctx.callbackQuery?.data ?? "";
  const [action, a, b] = data.split(":");
  const txId = Number(a);
  const arg = Number(b);
  if (!Number.isSafeInteger(txId) || txId <= 0) return ctx.answerCallbackQuery();

  switch (action) {
    case "b":
      await showMain(ctx, txId);
      return ctx.answerCallbackQuery();
    case "c": {
      const kb = await categoryPicker(txId);
      if (kb) await tolerateUnchanged(ctx.editMessageReplyMarkup({ reply_markup: kb }));
      return ctx.answerCallbackQuery(kb ? "Pick a category" : "Not available");
    }
    case "k": {
      const kb = await cardPicker(txId);
      if (kb) await tolerateUnchanged(ctx.editMessageReplyMarkup({ reply_markup: kb }));
      return ctx.answerCallbackQuery(kb ? "Pick a card" : "Not available");
    }
    case "sc": {
      const res = await updateTransactionCore({ id: txId, patch: { categoryId: arg } });
      const view = await txView(txId);
      if (!view) return ctx.answerCallbackQuery("Not found");
      const kb = res.suggestion
        ? new InlineKeyboard()
            .text(
              `✅ Always "${res.suggestion.pattern.slice(0, 24)}" → ${res.suggestion.categoryName}`,
              `ar:${txId}:${arg}`,
            )
            .row()
            .text("No thanks", `b:${txId}`)
        : view.keyboard;
      await tolerateUnchanged(ctx.editMessageText(view.text, { ...HTML, reply_markup: kb }));
      return ctx.answerCallbackQuery("Category updated");
    }
    case "ar": {
      const [tx] = await db()
        .select({ merchant: transactions.merchant, description: transactions.description })
        .from(transactions)
        .where(eq(transactions.id, txId));
      const pattern = (tx?.merchant || tx?.description || "").trim();
      if (pattern.length < 2) return ctx.answerCallbackQuery("Nothing to match on");
      const res = await createRuleFromSuggestionCore(pattern.slice(0, 60), arg);
      await showMain(ctx, txId);
      return ctx.answerCallbackQuery(res.applied ? `Rule created · ${res.applied} more categorized` : "Rule created");
    }
    case "sk":
      await updateTransactionCore({ id: txId, patch: { cardId: arg } });
      await showMain(ctx, txId);
      return ctx.answerCallbackQuery("Card updated");
    case "ok":
      await updateTransactionCore({ id: txId, patch: { status: "confirmed" } });
      await showMain(ctx, txId);
      return ctx.answerCallbackQuery("Confirmed");
    case "d": {
      await ctx.editMessageReplyMarkup({
        reply_markup: new InlineKeyboard().text("🗑 Yes, delete", `dd:${txId}`).text("Cancel", `b:${txId}`),
      });
      return ctx.answerCallbackQuery("Delete this transaction?");
    }
    case "dd": {
      const view = await txView(txId);
      await deleteTransactionCore(txId);
      await ctx.editMessageText(
        `🗑 <s>${view?.text.split("\n").find((l) => l.includes("<b>")) ?? "Transaction"}</s>\nDeleted.`,
        HTML,
      );
      return ctx.answerCallbackQuery("Deleted");
    }
    default:
      return ctx.answerCallbackQuery();
  }
}

/** Builds the bot. Only the configured user IDs, in private chats, get any response. */
export function createBot(token: string, allowedUserIds: number[], config?: BotConfig<Context>): Bot {
  const bot = new Bot(token, config);

  bot.use(async (ctx, next) => {
    const from = ctx.from?.id;
    if (!from || !allowedUserIds.includes(from)) return; // silently ignore everyone else
    if (ctx.chat && ctx.chat.type !== "private") return;
    await next();
  });

  bot.command(["start", "help"], (ctx) => ctx.reply(HELP, HTML));
  bot.command("today", async (ctx) => ctx.reply(await todayView(), HTML));
  bot.command("week", async (ctx) => ctx.reply(await weekView(), HTML));
  bot.command("month", async (ctx) => ctx.reply(await monthView(), HTML));
  bot.command("budget", async (ctx) => ctx.reply(await budgetView(), HTML));
  bot.command("cards", async (ctx) => ctx.reply(await cardsView(), HTML));
  bot.command("last", async (ctx) => ctx.reply(await lastView(), HTML));
  bot.command("inbox", async (ctx) => {
    const { text, pendingIds } = await inboxSummary();
    await ctx.reply(text, HTML);
    for (const id of pendingIds) {
      const view = await txView(id);
      if (view)
        await ctx.reply(view.text, {
          ...HTML,
          reply_markup: view.keyboard ?? mainKeyboard(id, { pending: true, transfer: false }),
        });
    }
  });
  bot.command("undo", async (ctx) => {
    const [last] = await db()
      .select()
      .from(transactions)
      .where(eq(transactions.source, "telegram"))
      .orderBy(desc(transactions.createdAt))
      .limit(1);
    if (!last) return ctx.reply("Nothing to undo — no transactions were created from Telegram.");
    await deleteTransactionCore(last.id);
    await ctx.reply(`↩️ Removed: ${txLine(last, { withDate: true })}`, HTML);
  });

  bot.on("message:text", handleText);
  bot.on("callback_query:data", handleCallback);
  bot.on("message", (ctx) =>
    ctx.reply("Send text: a quick entry like <code>50 lunch</code> or a bank SMS. /help", HTML),
  );

  bot.catch(async (err) => {
    const e = err.error;
    log.error("telegram: handler failed", { error: errorMessage(e), update: err.ctx.update.update_id });
    const text = e instanceof UserError ? `⚠️ ${esc(e.message)}` : "⚠️ Something went wrong. Please try again.";
    try {
      if (err.ctx.callbackQuery)
        await err.ctx.answerCallbackQuery({ text: text.replace(/<[^>]+>/g, ""), show_alert: true });
      else await err.ctx.reply(text, HTML);
    } catch {
      /* ignore secondary failures */
    }
  });

  return bot;
}
