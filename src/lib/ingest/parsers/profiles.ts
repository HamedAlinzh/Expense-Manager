import type { BankProfile, TypeKeyword } from "./types";

/**
 * Keywords shared by Iranian banks. Order matters: more specific phrases first
 * (e.g. "برگشت خرید" before "خرید"). Write keywords with Persian ی/ک; input is normalized.
 */
export const COMMON_KEYWORDS: TypeKeyword[] = [
  { text: "برگشت خرید", type: "refund" },
  { text: "برگشت", type: "refund" },
  { text: "استرداد", type: "refund" },
  { text: "واریز", type: "income" },
  { text: "سود", type: "income" },
  { text: "بستانکار", type: "income" },
  { text: "برداشت", type: "expense" },
  { text: "خرید", type: "expense" },
  { text: "کسر", type: "expense" },
  { text: "پرداخت", type: "expense" },
  { text: "بدهکار", type: "expense" },
  { text: "انتقال از", type: "expense", ambiguous: true },
  { text: "انتقال به", type: "income", ambiguous: true },
];

const without = (texts: string[]) => COMMON_KEYWORDS.filter((k) => !texts.includes(k.text));

/**
 * Tejarat — two layouts seen in real messages:
 *  account: "*بانک تجارت*\nحساب: …\nبرداشت: 107,200 ریال\nاز طريق: شتاب\nمانده: …\n1403/08/27\n11:00"
 *  card:    "بانک تجارت\nکارت: 6219****401234\nنوع تراکنش: انتقال به محلی\nمبلغ: … ريال\nمانده: …\n1405/04/10 - 17:38"
 * "انتقال به محلی" is money arriving (balance proves it); "انتقال از شتابی" is money leaving
 * (confirmed by the account holder).
 */
export const tejarat: BankProfile = {
  id: "tejarat",
  bank: "tejarat",
  bodyMarkers: [/بانک\s*تجارت/, /tejarat/i],
  senderHints: [/tejarat/i],
  keywords: [
    { text: "انتقال به", type: "income" },
    { text: "انتقال از", type: "expense" },
    ...without(["انتقال به", "انتقال از"]),
  ],
  headerLines: [/^بانک\s*تجارت$/],
};

/**
 * Sepah — "بانک سپه\nخريد پايانه فروش: 200,000\nحساب : …\nمانده:1,650,000\n6/16-10:34"
 * Dates carry no year (month/day); the year comes from the received time.
 */
export const sepah: BankProfile = {
  id: "sepah",
  bank: "sepah",
  bodyMarkers: [/بانک\s*سپه/, /sepah/i],
  senderHints: [/^(?:\+?98|0098)?986715000$/, /sepah/i],
  keywords: COMMON_KEYWORDS,
  headerLines: [/^بانک\s*سپه$/],
};

/**
 * Mellat — compact, no bank name in the body:
 * "حساب1029384756\nبرداشت5,001,000\nمانده294,607,975\n05/07/23-17:37" (yy/mm/dd)
 */
export const mellat: BankProfile = {
  id: "mellat",
  bank: "mellat",
  bodyMarkers: [/بانک\s*ملت/, /mellat/i],
  senderHints: [/mellat/i],
  keywords: COMMON_KEYWORDS,
  headerLines: [/^بانک\s*ملت$/],
};

/**
 * Blu (Saman digital bank) — SMS:
 * "بلو\nبرداشت پول\n<name> عزیز، 5,000,000ریال از حساب شما پرید.\nموجودی: 5,569,084 ریال\n۲۱:۴۰\n۱۴۰۵.۰۹.۰۲"
 * The amount sits on the line after the keyword, the time comes before a dot-separated date.
 * "پرید" (left) / "نشست" (arrived) back up the header keyword.
 */
export const blu: BankProfile = {
  id: "blu",
  bank: "blu",
  bodyMarkers: [/^بلو$/m, /بلو\s*بانک|بلوبانک|بانک\s*بلو/, /blu\s*bank|blubank/i],
  senderHints: [/blu/i, /samanpr|saman/i],
  keywords: [...COMMON_KEYWORDS, { text: "پرید", type: "expense" }, { text: "نشست", type: "income" }],
  headerLines: [/^(?:بلو|بلو\s*بانک|بلوبانک|blu\s*bank)$/i],
  amountPattern: /(\d{1,3}(?:[,٬،]\d{3})+|\d+)\s*(ریال|تومان)?\s*(?:از|به)\s*حساب\s*شما/,
};

export const PROFILES: BankProfile[] = [tejarat, sepah, mellat, blu];
