import { tehranParts, tehranWallTimeToUtc } from "@/lib/format/time";

/** Alerts created during quiet hours (Tehran time) wait until the end of the window. */
export const QUIET_HOURS = { start: 23, end: 8 } as const;

/** When a notification created at `now` may be delivered. */
export function deliveryTime(now: Date, quiet: { start: number; end: number } = QUIET_HOURS): Date {
  const p = tehranParts(now);
  const inQuiet =
    quiet.start > quiet.end ? p.hour >= quiet.start || p.hour < quiet.end : p.hour >= quiet.start && p.hour < quiet.end;
  if (!inQuiet) return now;
  const endToday = tehranWallTimeToUtc({ year: p.year, month: p.month, day: p.day, hour: quiet.end });
  if (endToday.getTime() > now.getTime()) return endToday;
  const tomorrow = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return tehranWallTimeToUtc({
    year: tomorrow.getUTCFullYear(),
    month: tomorrow.getUTCMonth() + 1,
    day: tomorrow.getUTCDate(),
    hour: quiet.end,
  });
}

/**
 * The highest budget threshold (percent) reached and not yet alerted, or null.
 * When one purchase jumps from 50% to 110%, only the 100% alert is sent.
 */
export function newThreshold(
  spentRial: number,
  limitRial: number,
  thresholds: number[],
  alreadySent: Set<number>,
): number | null {
  if (limitRial <= 0) return null;
  const pct = (spentRial / limitRial) * 100;
  const reached = [...thresholds].sort((a, b) => a - b).filter((t) => pct >= t);
  const top = reached.at(-1);
  // Nothing new if this level, or a higher one, was already alerted this month.
  if (top === undefined || [...alreadySent].some((sent) => sent >= top)) return null;
  return top;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export type AnomalyResult = { anomalous: boolean; typicalRial: number | null };

/**
 * An expense is unusual when it is at least `factor`× the median of comparable past expenses
 * AND far outside their spread (median + 4·MAD), with enough history and a minimum size.
 * Median/MAD are robust: one earlier outlier doesn't hide the next.
 */
export function anomalyCheck(
  amountRial: number,
  history: number[],
  opts: { minHistory?: number; factor?: number; minAmountRial?: number } = {},
): AnomalyResult {
  const { minHistory = 5, factor = 3, minAmountRial = 2_000_000 } = opts;
  if (history.length < minHistory) return { anomalous: false, typicalRial: null };
  const m = median(history);
  const mad = median(history.map((x) => Math.abs(x - m))) * 1.4826;
  const anomalous = amountRial >= minAmountRial && amountRial >= factor * m && amountRial > m + 4 * mad;
  return { anomalous, typicalRial: Math.round(m) };
}

export { median };
