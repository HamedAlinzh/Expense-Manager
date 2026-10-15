import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { InlineKeyboard } from "grammy";
import { db } from "@/db";
import { cards, categories, rawMessages, transactions } from "@/db/schema";
import {
  addDaysToKey,
  currentJalaliMonth,
  dayEnd,
  dayKeyOf,
  dayStart,
  formatDate,
  formatJalaliMonthKey,
  jalaliMonthProgress,
  jalaliMonthRange,
  monthKey,
  tehranParts,
  timeAgo,
} from "@/lib/format/time";
import { bar, categoryEmoji, esc, toman, txLine } from "@/lib/telegram/format";
import { budgetProgress, type Range, spendingByCategory, totals } from "@/server/queries/dashboard";

export type View = { text: string; keyboard?: InlineKeyboard };

const SIGN_ICON = { expense: "🔻", income: "🟢", refund: "↩️", transfer: "🔁" } as const;

async function loadTx(id: number) {
  const [row] = await db()
    .select({ tx: transactions, cardName: cards.name, catName: categories.name, catIcon: categories.icon })
    .from(transactions)
    .leftJoin(cards, eq(cards.id, transactions.cardId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(eq(transactions.id, id));
  return row ?? null;
}

/** Lays buttons out in rows of `cols` (no empty rows, which Telegram rejects). */
function grid(buttons: { text: string; data: string }[], cols: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  buttons.forEach((b, i) => {
    if (i > 0 && i % cols === 0) kb.row();
    kb.text(b.text, b.data);
  });
  return kb;
}

export function mainKeyboard(txId: number, opts: { pending: boolean; transfer: boolean }): InlineKeyboard {
  const kb = new InlineKeyboard();
  if (opts.pending) kb.text("✅ Confirm", `ok:${txId}`).row();
  if (!opts.transfer) kb.text("🏷 Category", `c:${txId}`);
  kb.text("💳 Card", `k:${txId}`).text("🗑 Delete", `d:${txId}`);
  return kb;
}

/** The message shown for one transaction (after saving, in /inbox, after edits). */
export async function txView(id: number, header?: string): Promise<View | null> {
  const row = await loadTx(id);
  if (!row) return null;
  const { tx } = row;
  const signed =
    tx.type === "transfer"
      ? toman(tx.amountRial)
      : toman(tx.direction === "out" ? -tx.amountRial : tx.amountRial, { sign: "always" });
  const lines = [
    header ? `${header}\n` : "",
    `${SIGN_ICON[tx.type]} <b>${esc(signed)}</b>${tx.merchant || tx.description ? `  ${esc(tx.merchant || tx.description)}` : ""}`,
    `💳 ${esc(row.cardName ?? "No card")}${tx.type === "transfer" ? " · transfer between your cards" : ` · ${categoryEmoji(row.catIcon)} ${esc(row.catName ?? "Uncategorized")}`}`,
    `🕒 ${formatDate(tx.occurredAt, { time: true })}${tx.tags.length ? `  ${tx.tags.map((t) => `#${esc(t)}`).join(" ")}` : ""}`,
  ];
  if (tx.status === "pending_review") lines.push("⚠️ <i>Needs review — confirm if it's right</i>");
  return {
    text: lines.filter(Boolean).join("\n"),
    keyboard: mainKeyboard(tx.id, { pending: tx.status === "pending_review", transfer: tx.type === "transfer" }),
  };
}

export async function categoryPicker(txId: number): Promise<InlineKeyboard | null> {
  const row = await loadTx(txId);
  if (!row || row.tx.type === "transfer") return null;
  const kind = row.tx.type === "expense" ? "expense" : "income";
  // Most-used categories first so the right one is usually on top.
  const usage = db()
    .select({ categoryId: transactions.categoryId, n: sql<number>`count(*)::int`.as("n") })
    .from(transactions)
    .groupBy(transactions.categoryId)
    .as("usage");
  const list = await db()
    .select({ id: categories.id, name: categories.name, icon: categories.icon })
    .from(categories)
    .leftJoin(usage, eq(usage.categoryId, categories.id))
    .where(and(eq(categories.kind, kind), eq(categories.archived, false)))
    .orderBy(sql`coalesce(${usage.n}, 0) desc`, asc(categories.sortOrder))
    .limit(24);
  return grid(
    list.map((c) => ({
      text: `${c.id === row.tx.categoryId ? "• " : ""}${categoryEmoji(c.icon)} ${c.name}`,
      data: `sc:${txId}:${c.id}`,
    })),
    2,
  )
    .row()
    .text("« Back", `b:${txId}`);
}

export async function cardPicker(txId: number): Promise<InlineKeyboard | null> {
  const row = await loadTx(txId);
  if (!row) return null;
  const list = await db().select().from(cards).where(eq(cards.archived, false)).orderBy(asc(cards.sortOrder));
  return grid(
    list.map((c) => ({ text: `${c.id === row.tx.cardId ? "• " : ""}${c.name}`, data: `sk:${txId}:${c.id}` })),
    2,
  )
    .row()
    .text("« Back", `b:${txId}`);
}

// ─── Summaries ──────────────────────────────────────────────────────────────

async function periodSummary(title: string, range: Range): Promise<string> {
  const [t, cat] = await Promise.all([totals(range), spendingByCategory(range)]);
  const lines = [
    `${title}`,
    `Spent <b>${esc(toman(t.spentRial))}</b> · Income ${esc(toman(t.incomeRial))} · ${t.count} transaction${t.count === 1 ? "" : "s"}`,
  ];
  if (cat.slices.length) {
    lines.push("");
    for (const s of cat.slices.slice(0, 8)) {
      const pct = t.spentRial ? Math.round((s.amountRial / t.spentRial) * 100) : 0;
      lines.push(`${categoryEmoji(s.icon)} ${esc(s.name)} — ${esc(toman(s.amountRial))} <i>(${pct}%)</i>`);
    }
    if (cat.slices.length > 8) lines.push(`<i>+ ${cat.slices.length - 8} more categories</i>`);
  } else {
    lines.push("<i>No spending recorded.</i>");
  }
  return lines.join("\n");
}

export async function todayView(now = new Date()): Promise<string> {
  const key = dayKeyOf(now);
  return periodSummary(`📅 <b>Today</b> · ${formatDate(now)}`, { start: dayStart(key)!, end: dayEnd(key)! });
}

/** Iranian week: Saturday → Friday. */
export async function weekView(now = new Date()): Promise<string> {
  const key = dayKeyOf(now);
  const sinceSaturday = (tehranParts(now).weekday + 1) % 7;
  const startKey = addDaysToKey(key, -sinceSaturday);
  const start = dayStart(startKey)!;
  return periodSummary(`🗓 <b>This week</b> · since Saturday ${formatDate(start)}`, { start, end: dayEnd(key)! });
}

export async function monthView(now = new Date()): Promise<string> {
  const { jy, jm } = currentJalaliMonth(now);
  const { daysLeft } = jalaliMonthProgress(now);
  return periodSummary(
    `🌙 <b>${formatJalaliMonthKey(monthKey(jy, jm))}</b> · ${daysLeft} days left`,
    jalaliMonthRange(jy, jm),
  );
}

export async function budgetView(now = new Date()): Promise<string> {
  const { jy, jm } = currentJalaliMonth(now);
  const range = jalaliMonthRange(jy, jm);
  const { leaf } = await spendingByCategory(range);
  const list = await budgetProgress(monthKey(jy, jm), leaf);
  const { daysLeft } = jalaliMonthProgress(now);
  if (list.length === 0) return "🎯 No budgets yet. Set monthly limits on the Budgets page in the app.";
  const lines = [`🎯 <b>Budgets · ${formatJalaliMonthKey(monthKey(jy, jm))}</b> · ${daysLeft} days left`, ""];
  for (const b of list) {
    const frac = b.spentRial / b.limitRial;
    const flag = frac >= 1 ? " 🔴 over" : frac >= 0.8 ? " ⚠️" : "";
    lines.push(`${categoryEmoji(b.icon)} <b>${esc(b.name)}</b>${flag}`);
    lines.push(
      `<code>${bar(frac)}</code> ${Math.round(frac * 100)}%  ${esc(toman(b.spentRial))} / ${esc(toman(b.limitRial))}`,
    );
  }
  return lines.join("\n");
}

export async function cardsView(): Promise<string> {
  const list = await db().select().from(cards).where(eq(cards.archived, false)).orderBy(asc(cards.sortOrder));
  if (list.length === 0) return "No cards yet.";
  const lines = ["💳 <b>Cards</b>", ""];
  for (const c of list) {
    const balance =
      c.lastKnownBalanceRial !== null ? `<b>${esc(toman(c.lastKnownBalanceRial))}</b>` : "<i>balance unknown</i>";
    const when = c.balanceUpdatedAt ? ` <i>(${timeAgo(c.balanceUpdatedAt)})</i>` : "";
    const low =
      c.lowBalanceThresholdRial !== null &&
      c.lastKnownBalanceRial !== null &&
      c.lastKnownBalanceRial < c.lowBalanceThresholdRial
        ? " ⚠️ low"
        : "";
    lines.push(`${esc(c.name)} — ${balance}${when}${low}`);
  }
  return lines.join("\n");
}

export async function lastView(limit = 10): Promise<string> {
  const rows = await db()
    .select()
    .from(transactions)
    .orderBy(desc(transactions.occurredAt), desc(transactions.id))
    .limit(limit);
  if (rows.length === 0) return "No transactions yet.";
  return [`🧾 <b>Last ${rows.length} transactions</b>`, "", ...rows.map((t) => txLine(t, { withDate: true }))].join(
    "\n",
  );
}

export async function inboxSummary(): Promise<{ text: string; pendingIds: number[] }> {
  const pending = await db()
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.status, "pending_review"))
    .orderBy(desc(transactions.occurredAt))
    .limit(50);
  const [unparsed] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(rawMessages)
    .where(inArray(rawMessages.parseStatus, ["needs_review", "failed"]));
  const parts = [`📥 <b>Inbox</b>`, `${pending.length} transaction${pending.length === 1 ? "" : "s"} to review`];
  if (unparsed?.n)
    parts.push(`${unparsed.n} unreadable message${unparsed.n === 1 ? "" : "s"} — open the Inbox in the app`);
  if (pending.length === 0 && !unparsed?.n) return { text: "📥 Inbox is empty — all caught up ✨", pendingIds: [] };
  if (pending.length > 5) parts.push(`<i>Showing the 5 most recent.</i>`);
  return { text: parts.join("\n"), pendingIds: pending.slice(0, 5).map((p) => p.id) };
}
