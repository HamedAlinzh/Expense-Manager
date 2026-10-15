import { isValidJalaliDate, toJalali } from "@/lib/format/jalali";
import { jalaliToUtc, tehranParts, tehranWallTimeToUtc } from "@/lib/format/time";
import { normalizeMerchant } from "../merchant";
import { normalizeSmsBody } from "../normalize";
import type { BankProfile, ParseContext, ParseResult, ParsedType, TypeKeyword } from "./types";

/** Amount with optional thousands separators, e.g. "1,250,000", "1٬250٬000", "1250000". */
const AMOUNT = String.raw`(\d{1,3}(?:[,٬،]\d{3})+|\d+)`;
const UNIT = String.raw`\s*(ریال|تومان)?`;

function toRial(amount: string, unit: string | undefined): number | null {
  const n = Number(amount.replace(/[,٬،]/g, ""));
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  const rial = unit === "تومان" ? n * 10 : n;
  return Number.isSafeInteger(rial) ? rial : null;
}

const REFERENCE_WORDS = /کد|پیگیری|شماره|مرجع|سند|ترمینال|پایانه\s*\d/;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s*");

// ─── Type + amount ──────────────────────────────────────────────────────────

type AmountHit = { keyword: TypeKeyword; qualifier: string; amountRial: number; index: number };

/** "برداشت5,001,000", "واریز: 50,000,000 ریال", "خرید پایانه فروش: 200,000" */
function keywordAmounts(text: string, keywords: TypeKeyword[]): AmountHit[] {
  const hits: AmountHit[] = [];
  const taken: [number, number][] = [];
  for (const kw of keywords) {
    // Keyword must start a word ("دستورپرداخت" is not "پرداخت").
    const re = new RegExp(
      `(?<!\\p{L})${escapeRe(normalizeSmsBody(kw.text))}([^\\n\\d:]{0,30}?)\\s*[:：]?\\s*${AMOUNT}${UNIT}`,
      "gu",
    );
    for (const m of text.matchAll(re)) {
      const start = m.index!;
      const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue; // a longer keyword already claimed this span
      if (REFERENCE_WORDS.test(m[1]!)) continue; // "… کدپیگیری 1405…" is a reference, not an amount
      if (!/[,\u066C\u060C]/.test(m[2]!) && m[2]!.length > 12) continue; // long bare digit runs are ids
      const amountRial = toRial(m[2]!, m[3]);
      if (amountRial === null) continue;
      taken.push([start, end]);
      hits.push({ keyword: kw, qualifier: m[1]!.trim(), amountRial, index: start });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

/** Structured layout: "نوع تراکنش: خرید شتابی" + "مبلغ: 200,000 ریال". */
function structured(
  text: string,
  keywords: TypeKeyword[],
): { typeText: string; keyword: TypeKeyword | null; amountRial: number } | null {
  const amount = new RegExp(`مبلغ(?:\\s*تراکنش)?\\s*[:：]?\\s*${AMOUNT}${UNIT}`).exec(text);
  if (!amount) return null;
  const amountRial = toRial(amount[1]!, amount[2]);
  if (amountRial === null) return null;
  const typeLine = /(?:نوع\s*(?:تراکنش|عملیات)|شرح)\s*[:：]\s*([^\n]+)/.exec(text);
  const typeText = typeLine?.[1]?.trim() ?? "";
  const has = (k: TypeKeyword, t: string) =>
    new RegExp(`(?<!\\p{L})${escapeRe(normalizeSmsBody(k.text))}`, "u").test(t);
  const keyword = keywords.find((k) => has(k, typeText)) ?? keywords.find((k) => has(k, text)) ?? null;
  return { typeText, keyword, amountRial };
}

// ─── Balance, identifiers, channel ──────────────────────────────────────────

function balance(text: string): number | null {
  const m = new RegExp(`(?:مانده|موجودی)(?:\\s*(?:حساب|قابل\\s*برداشت))?\\s*[:：]?\\s*(-)?\\s*${AMOUNT}${UNIT}`).exec(
    text,
  );
  if (!m) return null;
  const n = Number(m[2]!.replace(/[,٬،]/g, ""));
  if (!Number.isSafeInteger(n)) return null;
  const rial = m[3] === "تومان" ? n * 10 : n;
  return m[1] ? -rial : rial;
}

function identifier(text: string): string | null {
  const patterns = [
    /(?:شماره\s*)?(?:حساب|سپرده)\s*[:：]?\s*([\d*-]{6,})/,
    /(?:شماره\s*)?کارت\s*[:：]?\s*([\d*-]{6,})/,
    /(\d{4,6}\*{2,}\d{2,6})/,
    /(\*{2,}\d{4})/,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) return m[1]!.replace(/-/g, "");
  }
  return null;
}

function channel(text: string): string | null {
  return /از\s*طریق\s*[:：]\s*([^\n]+)/.exec(text)?.[1]?.trim() || null;
}

function merchant(text: string): string | null {
  const m = /(?:نام\s*)?(?:پذیرنده|فروشگاه|ترمینال)\s*[:：]\s*([^\n]+)/.exec(text);
  return m ? normalizeMerchant(m[1]) : null;
}

// ─── Date & time ────────────────────────────────────────────────────────────

type DateHit = { jy: number | null; jm: number; jd: number; gregorian?: boolean; index: number };

function findDate(text: string): DateHit | null {
  const full = /(?<![\d/])(\d{4})\/(\d{1,2})\/(\d{1,2})(?![\d/])/.exec(text);
  if (full) {
    const y = Number(full[1]);
    return { jy: y, jm: Number(full[2]), jd: Number(full[3]), gregorian: y > 1900, index: full.index };
  }
  const short = /(?<![\d/])(\d{2})\/(\d{1,2})\/(\d{1,2})(?![\d/])/.exec(text);
  if (short) return { jy: Number(short[1]) + 10_000, jm: Number(short[2]), jd: Number(short[3]), index: short.index }; // +10000 marks a 2-digit year
  const noYear = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?![\d/])/.exec(text);
  if (noYear) return { jy: null, jm: Number(noYear[1]), jd: Number(noYear[2]), index: noYear.index };
  const compact = /(?<!\d)(\d{2})(\d{2})\s*[-–]\s*(?=\d{1,2}:\d{2})/.exec(text); // "0723-17:37"
  if (compact) return { jy: null, jm: Number(compact[1]), jd: Number(compact[2]), index: compact.index };
  return null;
}

function findTime(text: string, after = 0): { h: number; m: number; s: number } | null {
  const re = /(?<!\d)([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?(?!\d)/g; // "ساعت:18:41" has a colon before the hour
  let fallback: RegExpExecArray | null = null;
  for (const m of text.matchAll(re)) {
    if (m.index! >= after) return { h: Number(m[1]), m: Number(m[2]), s: Number(m[3] ?? 0) };
    fallback ??= m;
  }
  return fallback ? { h: Number(fallback[1]), m: Number(fallback[2]), s: Number(fallback[3] ?? 0) } : null;
}

/** Resolves partial Jalali dates against the time the message was received. */
function resolveDate(
  hit: DateHit,
  receivedAt: Date,
): { jy: number; jm: number; jd: number; gregorian: boolean } | null {
  if (hit.gregorian) return { jy: hit.jy!, jm: hit.jm, jd: hit.jd, gregorian: true };
  const rp = tehranParts(receivedAt);
  const recv = toJalali(rp.year, rp.month, rp.day);
  let jy: number;
  if (hit.jy === null) {
    // No year: assume the most recent occurrence not after the received date (+1 day slack).
    jy = recv.jy;
    if (hit.jm > recv.jm || (hit.jm === recv.jm && hit.jd > recv.jd + 1)) jy -= 1;
  } else if (hit.jy >= 10_000) {
    const yy = hit.jy - 10_000;
    const century = Math.floor(recv.jy / 100) * 100;
    jy = century + yy > recv.jy + 1 ? century - 100 + yy : century + yy;
  } else {
    jy = hit.jy;
  }
  return isValidJalaliDate(jy, hit.jm, hit.jd) ? { jy, jm: hit.jm, jd: hit.jd, gregorian: false } : null;
}

// ─── Description ────────────────────────────────────────────────────────────

const KNOWN_LINE =
  /(مانده|موجودی|حساب|سپرده|کارت|مبلغ|نوع\s*(?:تراکنش|عملیات)|از\s*طریق|تاریخ|ساعت|کد\s*شعبه|کدشعبه|^[\d/:\s-]+$)/;

function extraInfo(text: string, profile: BankProfile | null): string[] {
  return text
    .split("\n")
    .filter((l) => !KNOWN_LINE.test(l) && !(profile?.headerLines ?? []).some((h) => h.test(l)) && !/^بانک\s/.test(l))
    .filter(
      (l) =>
        !(profile?.keywords ?? []).some((k) =>
          new RegExp(`(?<!\\p{L})${escapeRe(normalizeSmsBody(k.text))}[^\\n]*\\d`, "u").test(l),
        ),
    )
    .map((l) =>
      l
        .replace(/(?:کد\s*پیگیری|کدپیگیری|شماره\s*پیگیری|پیگیری|مرجع)\s*[:：]?\s*\d+/g, "")
        .replace(/\d{6,}/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((l) => l.length >= 3);
}

// ─── Main ───────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/**
 * Shared extraction used by every bank profile (and the generic parser with generic keywords).
 * Returns null when no amount with a direction can be found.
 */
export function extractTransaction(
  rawBody: string,
  profile: BankProfile | null,
  keywords: TypeKeyword[],
  ctx: ParseContext,
  parserName: string,
): ParseResult | null {
  const text = normalizeSmsBody(rawBody);
  const notes: string[] = [];
  let confidence = 0;

  // 1. Type + amount
  let type: ParsedType | null = null;
  let amountRial: number | null = null;
  let label = "";
  let ambiguous = false;
  const hits = keywordAmounts(text, keywords);
  const st = hits.length === 0 ? structured(text, keywords) : null;
  if (hits.length > 0) {
    const first = hits[0]!;
    type = first.keyword.type;
    amountRial = first.amountRial;
    ambiguous = !!first.keyword.ambiguous;
    label = [first.keyword.text, first.qualifier].filter(Boolean).join(" ");
    const kinds = new Set(hits.map((h) => (h.keyword.type === "expense" ? "out" : "in")));
    if (kinds.size > 1) {
      confidence -= 0.3;
      notes.push("conflicting direction keywords");
    }
  } else if (st) {
    amountRial = st.amountRial;
    if (st.keyword) {
      type = st.keyword.type;
      ambiguous = !!st.keyword.ambiguous;
    }
    label = st.typeText;
  }
  if (amountRial === null) return null;
  confidence += 0.35;
  if (type === null) {
    type = "expense";
    notes.push("direction unknown, assumed expense");
  } else {
    confidence += ambiguous ? 0.1 : 0.25;
    if (ambiguous) notes.push(`ambiguous keyword "${label}"`);
  }

  // 2. Date & time
  let occurredAt = ctx.receivedAt;
  let occurredAtSource: ParseResult["occurredAtSource"] = "received";
  const dateHit = findDate(text);
  const resolved = dateHit ? resolveDate(dateHit, ctx.receivedAt) : null;
  const time = findTime(text, dateHit?.index ?? 0);
  if (resolved) {
    const t = time ?? { h: 12, m: 0, s: 0 };
    occurredAt = resolved.gregorian
      ? tehranWallTimeToUtc({
          year: resolved.jy,
          month: resolved.jm,
          day: resolved.jd,
          hour: t.h,
          minute: t.m,
          second: t.s,
        })
      : jalaliToUtc({ jy: resolved.jy, jm: resolved.jm, jd: resolved.jd, hour: t.h, minute: t.m, second: t.s });
    occurredAtSource = "message";
    confidence += time ? 0.15 : 0.08;
    const diff = occurredAt.getTime() - ctx.receivedAt.getTime();
    if (diff > DAY_MS || diff < -60 * DAY_MS) {
      confidence -= 0.25;
      notes.push("message date far from received time");
    }
  } else if (time) {
    // Time only: today's date (Tehran) at that time; yesterday if that would be in the future.
    const p = tehranParts(ctx.receivedAt);
    let at = tehranWallTimeToUtc({
      year: p.year,
      month: p.month,
      day: p.day,
      hour: time.h,
      minute: time.m,
      second: time.s,
    });
    if (at.getTime() - ctx.receivedAt.getTime() > 10 * 60_000) at = new Date(at.getTime() - DAY_MS);
    occurredAt = at;
    occurredAtSource = "message";
    confidence += 0.08;
  } else {
    notes.push("no date in message, used received time");
  }

  // 3. Balance, identifier, bank
  const balanceAfterRial = balance(text);
  if (balanceAfterRial !== null) confidence += 0.1;
  const id = identifier(text);
  if (id) confidence += 0.1;
  if (profile) confidence += 0.05;

  // 4. Description & merchant
  const via = channel(text);
  const parts = [label || (type === "expense" ? "برداشت" : "واریز"), via, ...extraInfo(text, profile)].filter(
    (p): p is string => !!p,
  );
  const description = [...new Set(parts)].join(" · ").slice(0, 200);

  return {
    parser: parserName,
    bank: profile?.bank ?? null,
    type,
    amountRial,
    occurredAt,
    occurredAtSource,
    identifier: id,
    balanceAfterRial,
    description,
    merchant: merchant(text),
    confidence: Math.max(0, Math.min(1, Math.round(confidence * 100) / 100)),
    notes,
  };
}
