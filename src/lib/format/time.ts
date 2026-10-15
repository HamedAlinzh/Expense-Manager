import {
  addJalaliMonths,
  GREGORIAN_MONTHS_EN,
  isValidJalaliDate,
  JALALI_MONTHS_EN,
  jalaliMonthLength,
  toGregorian,
  toJalali,
} from "./jalali";
import { toPersianDigits } from "./text";

/** All calendar logic (days, months, budgets, reports) is evaluated in Tehran local time. */
export const APP_TZ = "Asia/Tehran";

export type WallTime = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
  weekday: "short",
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Gregorian wall-clock components of `date` in Tehran. `weekday`: 0 = Sunday … 6 = Saturday. */
export function tehranParts(date: Date): WallTime & { weekday: number } {
  const out: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(date)) out[p.type] = p.value;
  return {
    year: Number(out.year),
    month: Number(out.month),
    day: Number(out.day),
    hour: Number(out.hour) % 24,
    minute: Number(out.minute),
    second: Number(out.second),
    weekday: WEEKDAYS.indexOf(out.weekday ?? "Sun"),
  };
}

function offsetMs(date: Date): number {
  const p = tehranParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Converts a Tehran wall-clock time (Gregorian components) to an absolute instant.
 * Handles Iran's historical DST (abolished in 2022) via the runtime's tz database.
 */
export function tehranWallTimeToUtc(w: Partial<WallTime> & Pick<WallTime, "year" | "month" | "day">): Date {
  const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour ?? 0, w.minute ?? 0, w.second ?? 0);
  const first = guess - offsetMs(new Date(guess));
  const second = guess - offsetMs(new Date(first));
  return new Date(second);
}

export type JalaliWallTime = { jy: number; jm: number; jd: number; hour?: number; minute?: number; second?: number };

export function jalaliToUtc(j: JalaliWallTime): Date {
  if (!isValidJalaliDate(j.jy, j.jm, j.jd)) throw new RangeError(`Invalid Jalali date ${j.jy}/${j.jm}/${j.jd}`);
  const g = toGregorian(j.jy, j.jm, j.jd);
  return tehranWallTimeToUtc({ year: g.gy, month: g.gm, day: g.gd, hour: j.hour, minute: j.minute, second: j.second });
}

export type JalaliParts = {
  jy: number;
  jm: number;
  jd: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

export function toJalaliParts(date: Date): JalaliParts {
  const p = tehranParts(date);
  const j = toJalali(p.year, p.month, p.day);
  return { ...j, hour: p.hour, minute: p.minute, second: p.second, weekday: p.weekday };
}

// ─── Month keys and ranges (Jalali months drive budgets and reports) ─────────

/** "1405-07" */
export type MonthKey = string;

export function monthKey(jy: number, jm: number): MonthKey {
  return `${jy}-${String(jm).padStart(2, "0")}`;
}

export function parseMonthKey(key: MonthKey): { jy: number; jm: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const jy = Number(m[1]);
  const jm = Number(m[2]);
  return jm >= 1 && jm <= 12 ? { jy, jm } : null;
}

export function jalaliMonthKeyOf(date: Date): MonthKey {
  const { jy, jm } = toJalaliParts(date);
  return monthKey(jy, jm);
}

/** [start, end) of a Jalali month as absolute instants. */
export function jalaliMonthRange(jy: number, jm: number): { start: Date; end: Date } {
  const next = addJalaliMonths(jy, jm, 1);
  return { start: jalaliToUtc({ jy, jm, jd: 1 }), end: jalaliToUtc({ jy: next.jy, jm: next.jm, jd: 1 }) };
}

export function currentJalaliMonth(now = new Date()): { jy: number; jm: number } {
  const { jy, jm } = toJalaliParts(now);
  return { jy, jm };
}

/** Days elapsed (including today) and total days in the Jalali month containing `now`. */
export function jalaliMonthProgress(now = new Date()): { dayOfMonth: number; daysInMonth: number; daysLeft: number } {
  const { jy, jm, jd } = toJalaliParts(now);
  const daysInMonth = jalaliMonthLength(jy, jm);
  return { dayOfMonth: jd, daysInMonth, daysLeft: daysInMonth - jd };
}

// ─── Day keys (date-only values in URLs and inputs, Tehran local day) ────────

/** "2026-10-15" — Gregorian date of the Tehran local day. Used in URLs regardless of display calendar. */
export type DayKey = string;

export function dayKeyOf(date: Date): DayKey {
  const p = tehranParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function parseDayKey(key: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** Start of the Tehran day for a DayKey. */
export function dayStart(key: DayKey): Date | null {
  const d = parseDayKey(key);
  return d ? tehranWallTimeToUtc(d) : null;
}

/** Start of the day after `key` (exclusive range end). */
export function dayEnd(key: DayKey): Date | null {
  const d = parseDayKey(key);
  if (!d) return null;
  const next = new Date(Date.UTC(d.year, d.month - 1, d.day + 1));
  return tehranWallTimeToUtc({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() });
}

export function dayKeyFromJalali(jy: number, jm: number, jd: number): DayKey {
  const g = toGregorian(jy, jm, jd);
  return `${g.gy}-${String(g.gm).padStart(2, "0")}-${String(g.gd).padStart(2, "0")}`;
}

export function addDaysToKey(key: DayKey, days: number): DayKey {
  const d = parseDayKey(key);
  if (!d) return key;
  const next = new Date(Date.UTC(d.year, d.month - 1, d.day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export type CalendarKind = "jalali" | "gregorian";

export type FormatDateOptions = {
  calendar?: CalendarKind;
  digits?: "latin" | "persian";
  time?: boolean;
  seconds?: boolean;
  /** Short year "05/07/23" */
  shortYear?: boolean;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "1405/07/23 — 14:32" (Jalali) or "2026/10/15 — 14:32" (Gregorian), always in Tehran time. */
export function formatDate(date: Date, opts: FormatDateOptions = {}): string {
  const { calendar = "jalali", digits = "latin", time = false, seconds = false, shortYear = false } = opts;
  const p = tehranParts(date);
  let y: number, m: number, d: number;
  if (calendar === "jalali") {
    const j = toJalali(p.year, p.month, p.day);
    [y, m, d] = [j.jy, j.jm, j.jd];
  } else {
    [y, m, d] = [p.year, p.month, p.day];
  }
  const yStr = shortYear ? pad2(y % 100) : String(y);
  let out = `${yStr}/${pad2(m)}/${pad2(d)}`;
  if (time) out += ` — ${pad2(p.hour)}:${pad2(p.minute)}${seconds ? `:${pad2(p.second)}` : ""}`;
  return digits === "persian" ? toPersianDigits(out) : out;
}

export function formatTime(date: Date, digits: "latin" | "persian" = "latin"): string {
  const p = tehranParts(date);
  const out = `${pad2(p.hour)}:${pad2(p.minute)}`;
  return digits === "persian" ? toPersianDigits(out) : out;
}

/** "Mehr 1405" or "October 2026". */
export function formatMonthLabel(date: Date, calendar: CalendarKind = "jalali"): string {
  const p = tehranParts(date);
  if (calendar === "jalali") {
    const j = toJalali(p.year, p.month, p.day);
    return `${JALALI_MONTHS_EN[j.jm - 1]} ${j.jy}`;
  }
  return `${GREGORIAN_MONTHS_EN[p.month - 1]} ${p.year}`;
}

export function formatJalaliMonthKey(key: MonthKey): string {
  const parsed = parseMonthKey(key);
  return parsed ? `${JALALI_MONTHS_EN[parsed.jm - 1]} ${parsed.jy}` : key;
}

/** "Today", "Yesterday", or a formatted date — for grouping lists by day. */
export function relativeDayLabel(date: Date, calendar: CalendarKind, now = new Date()): string {
  const key = dayKeyOf(date);
  if (key === dayKeyOf(now)) return "Today";
  if (key === addDaysToKey(dayKeyOf(now), -1)) return "Yesterday";
  const p = tehranParts(date);
  const weekday = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][p.weekday];
  if (calendar === "jalali") {
    const j = toJalali(p.year, p.month, p.day);
    return `${weekday}, ${j.jd} ${JALALI_MONTHS_EN[j.jm - 1]} ${j.jy}`;
  }
  return `${weekday}, ${p.day} ${GREGORIAN_MONTHS_EN[p.month - 1]} ${p.year}`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** "5 minutes ago", "yesterday", "3 days ago" … */
export function timeAgo(date: Date, now = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86_400 * 30) return rtf.format(Math.round(seconds / 86_400), "day");
  if (abs < 86_400 * 365) return rtf.format(Math.round(seconds / (86_400 * 30)), "month");
  return rtf.format(Math.round(seconds / (86_400 * 365)), "year");
}
