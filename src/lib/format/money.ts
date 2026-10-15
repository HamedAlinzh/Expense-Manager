import { normalizeDigits, toPersianDigits } from "./text";

/**
 * Money rules:
 *  - Storage is always an integer number of RIAL.
 *  - 1 Toman = 10 Rial; the Telegram bot's default input unit is THOUSAND Toman (= 10,000 Rial).
 *  - Parsing works on decimal strings, never on floats, so "12.5" kT is exactly 125,000 Rial.
 */
export type MoneyUnit = "rial" | "toman" | "thousand_toman";

export const RIAL_PER_UNIT: Record<MoneyUnit, number> = {
  rial: 1,
  toman: 10,
  thousand_toman: 10_000,
};

/** Decimal places that still resolve to whole Rial in each unit. */
const MAX_DECIMALS: Record<MoneyUnit, number> = { rial: 0, toman: 1, thousand_toman: 4 };

// Thousands separators: comma, Arabic thousands separator (٬ U+066C), Arabic comma (، U+060C), apostrophe.
const GROUP_SEP = /[,٬،']/;
// Decimal separators: dot and Arabic decimal separator (٫ U+066B).
const DECIMAL_SEP = /[.٫]/;

/** Strips grouping separators, validating that groups after the first have exactly 3 digits. */
function stripGrouping(intPart: string): string | null {
  if (!GROUP_SEP.test(intPart)) return /^\d+$/.test(intPart) ? intPart : null;
  const groups = intPart.split(new RegExp(GROUP_SEP.source, "g"));
  const [head, ...rest] = groups;
  if (!head || !/^\d{1,3}$/.test(head)) return null;
  if (!rest.every((g) => /^\d{3}$/.test(g))) return null;
  return groups.join("");
}

/**
 * Parses a non-negative decimal amount typed in `unit` and returns integer Rial, or null if invalid.
 * Accepts Persian/Arabic/Western digits, thousands separators (, ٬ ،) and a decimal point (. ٫).
 * Rejects negatives, more precision than one Rial, and values above Number.MAX_SAFE_INTEGER.
 */
export function parseAmountToRial(input: string, unit: MoneyUnit): number | null {
  const s = normalizeDigits(input).trim().replace(/\s+/g, "");
  if (s === "") return null;
  const parts = s.split(DECIMAL_SEP);
  if (parts.length > 2) return null;
  const [rawInt = "", rawFrac = ""] = parts;
  if (parts.length === 2 && rawFrac === "") return null; // "12." is a typo, not 12
  const intDigits = rawInt === "" ? "0" : stripGrouping(rawInt);
  if (intDigits === null) return null;
  if (!/^\d*$/.test(rawFrac)) return null;

  const frac = rawFrac.replace(/0+$/, "");
  if (frac.length > MAX_DECIMALS[unit]) return null;

  const scale = RIAL_PER_UNIT[unit];
  const intValue = Number(intDigits);
  const fracValue = frac === "" ? 0 : Number(frac.padEnd(MAX_DECIMALS[unit], "0")) * (scale / 10 ** MAX_DECIMALS[unit]);
  const rial = intValue * scale + fracValue;
  if (!Number.isSafeInteger(rial)) return null;
  return rial;
}

/** Bot input: amounts are thousand Toman by default (`50` → 500,000 Rial). */
export function parseThousandTomanToRial(input: string): number | null {
  return parseAmountToRial(input, "thousand_toman");
}

/** Bank SMS amounts: integer Rial with optional thousands separators (lenient about grouping). */
export function parseRialAmount(input: string): number | null {
  const s = normalizeDigits(input).replace(/[\s,٬،']/g, "");
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export function tomanToRial(toman: number): number {
  return Math.round(toman * RIAL_PER_UNIT.toman);
}

/** Converts Rial to `unit` for display. Result may be fractional (e.g. 125,005 Rial = 12.5005 kT). */
export function rialToUnit(rial: number, unit: MoneyUnit): number {
  return rial / RIAL_PER_UNIT[unit];
}

export const UNIT_LABELS: Record<MoneyUnit, { latin: string; persian: string; long: string }> = {
  rial: { latin: "IRR", persian: "ریال", long: "Rial" },
  toman: { latin: "T", persian: "تومان", long: "Toman" },
  thousand_toman: { latin: "kT", persian: "هزار تومان", long: "Thousand Toman" },
};

export type FormatMoneyOptions = {
  unit?: MoneyUnit;
  /** "auto": minus for negatives; "always": +/−; "never": absolute value. */
  sign?: "auto" | "always" | "never";
  digits?: "latin" | "persian";
  withUnit?: boolean;
  /** 1.25M style, for chart axes and tight spaces. */
  compact?: boolean;
};

const MINUS = "−"; // typographic minus

export function formatMoney(rial: number, opts: FormatMoneyOptions = {}): string {
  const { unit = "toman", sign = "auto", digits = "latin", withUnit = true, compact = false } = opts;
  const value = rialToUnit(Math.abs(rial), unit);
  const nf = new Intl.NumberFormat(digits === "persian" ? "fa-IR" : "en-US", {
    maximumFractionDigits: compact ? 1 : MAX_DECIMALS[unit],
    minimumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  });
  let body = nf.format(value);
  if (digits === "persian") body = toPersianDigits(body); // fa-IR already does this; guards against ICU builds without fa data
  const signStr = rial < 0 && sign !== "never" ? MINUS : rial > 0 && sign === "always" ? "+" : "";
  if (!withUnit) return `${signStr}${body}`;
  const label = digits === "persian" ? UNIT_LABELS[unit].persian : UNIT_LABELS[unit].latin;
  return `${signStr}${body} ${label}`;
}

/** Signed Rial delta for a transaction from its type (transfers count as zero for totals). */
export function signedRial(type: "expense" | "income" | "transfer" | "refund", amountRial: number): number {
  if (type === "expense") return -amountRial;
  if (type === "income" || type === "refund") return amountRial;
  return 0;
}
