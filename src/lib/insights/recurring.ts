import { addJalaliMonths, jalaliMonthLength } from "@/lib/format/jalali";
import { normalizeText } from "@/lib/format/text";
import { jalaliToUtc, toJalaliParts } from "@/lib/format/time";
import { median } from "./alerts";

export type Interval = "weekly" | "monthly" | "yearly";

/** Words that describe the payment channel, not a merchant (common in bank SMS descriptions). */
const GENERIC = new Set(
  "برداشت واریز خرید پایانه فروش فروشگاهی اینترنتی شتاب شتابی شعبه دیجیتال خودپرداز انتقال به از محلی کارت حساب دستورپرداخت دستور پرداخت وارده پل ساتنا پایا سود · - transfer purchase withdrawal deposit pos atm".split(
    " ",
  ),
);

/** Grouping key for a merchant: normalized text without digits/punctuation; null if it's only channel words. */
export function recurringKey(merchant: string | null, description: string): string | null {
  const text = normalizeText(merchant || description)
    .replace(/[0-9]+/g, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 3) return null;
  if (text.split(" ").every((w) => GENERIC.has(w))) return null;
  return text;
}

const BANDS: Record<Interval, [number, number]> = { weekly: [5, 9], monthly: [26, 35], yearly: [350, 380] };
const DAY = 86_400_000;

export type RecurringTx = {
  id: number;
  amountRial: number;
  occurredAt: Date;
  display: string;
  cardId: number | null;
  categoryId: number | null;
};

export type Detection = {
  key: string;
  merchant: string;
  interval: Interval;
  typicalAmountRial: number;
  lastAmountRial: number;
  lastTransactionId: number;
  lastSeenAt: Date;
  nextExpectedAt: Date;
  occurrences: number;
  cardId: number | null;
  categoryId: number | null;
};

/** Next expected charge: same Jalali day next month (clamped), +7 days, or same day next Jalali year. */
export function nextExpected(last: Date, interval: Interval): Date {
  if (interval === "weekly") return new Date(last.getTime() + 7 * DAY);
  const p = toJalaliParts(last);
  const target = interval === "monthly" ? addJalaliMonths(p.jy, p.jm, 1) : { jy: p.jy + 1, jm: p.jm };
  const jd = Math.min(p.jd, jalaliMonthLength(target.jy, target.jm));
  return jalaliToUtc({ jy: target.jy, jm: target.jm, jd, hour: p.hour, minute: p.minute });
}

/**
 * Detects one recurring series in a group of same-merchant expenses.
 * Requires ≥3 charges (≥2 for yearly), ≥70% of gaps inside the interval band, and ≥70% of
 * amounts within ±20% of the median — so a weekly supermarket run with varying totals doesn't count.
 */
export function detectSeries(key: string, txs: RecurringTx[]): Detection | null {
  const sorted = [...txs].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  if (sorted.length < 2) return null;
  const gaps = sorted.slice(1).map((t, i) => (t.occurredAt.getTime() - sorted[i]!.occurredAt.getTime()) / DAY);
  const medianGap = median(gaps);

  const interval = (Object.keys(BANDS) as Interval[]).find(
    (iv) => medianGap >= BANDS[iv][0] && medianGap <= BANDS[iv][1],
  );
  if (!interval) return null;
  if (sorted.length < (interval === "yearly" ? 2 : 3)) return null;
  const [lo, hi] = BANDS[interval];
  if (gaps.filter((g) => g >= lo && g <= hi).length / gaps.length < 0.7) return null;

  const amounts = sorted.map((t) => t.amountRial);
  const m = median(amounts);
  if (amounts.filter((a) => Math.abs(a - m) <= 0.2 * m).length / amounts.length < 0.7) return null;

  const last = sorted.at(-1)!;
  const earlier = sorted.slice(0, -1).map((t) => t.amountRial);
  return {
    key,
    merchant: last.display,
    interval,
    typicalAmountRial: Math.round(median(earlier)),
    lastAmountRial: last.amountRial,
    lastTransactionId: last.id,
    lastSeenAt: last.occurredAt,
    nextExpectedAt: nextExpected(last.occurredAt, interval),
    occurrences: sorted.length,
    cardId: last.cardId,
    categoryId: last.categoryId,
  };
}

/** Grace period after the expected date before a missing charge is reported. */
export const MISSING_GRACE_DAYS: Record<Interval, number> = { weekly: 2, monthly: 5, yearly: 14 };

/** Price change of the latest charge vs the typical one, as a fraction (0.14 = +14%), when ≥5%. */
export function priceChange(d: Pick<Detection, "typicalAmountRial" | "lastAmountRial">): number | null {
  if (d.typicalAmountRial <= 0) return null;
  const change = (d.lastAmountRial - d.typicalAmountRial) / d.typicalAmountRial;
  return Math.abs(change) >= 0.05 ? change : null;
}

/** Yearly cost of a series. */
export function yearlyCost(amountRial: number, interval: Interval): number {
  return amountRial * (interval === "weekly" ? 52 : interval === "monthly" ? 12 : 1);
}
