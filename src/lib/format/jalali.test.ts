import { describe, expect, it } from "vitest";
import {
  addJalaliMonths,
  isJalaliLeapYear,
  isValidJalaliDate,
  jalaliMonthLength,
  toGregorian,
  toJalali,
} from "./jalali";

describe("known conversions", () => {
  it.each([
    [
      [2026, 10, 15],
      [1405, 7, 23],
    ],
    [
      [2026, 3, 21],
      [1405, 1, 1],
    ],
    [
      [2025, 3, 20],
      [1403, 12, 30],
    ],
    [
      [2025, 3, 21],
      [1404, 1, 1],
    ],
    [
      [2021, 3, 21],
      [1400, 1, 1],
    ],
    [
      [2020, 3, 20],
      [1399, 1, 1],
    ],
    [
      [1979, 2, 11],
      [1357, 11, 22],
    ],
    [
      [2000, 1, 1],
      [1378, 10, 11],
    ],
  ] as const)("%j ⇄ %j", ([gy, gm, gd], [jy, jm, jd]) => {
    expect(toJalali(gy, gm, gd)).toEqual({ jy, jm, jd });
    expect(toGregorian(jy, jm, jd)).toEqual({ gy, gm, gd });
  });
});

describe("cross-check against the runtime's Persian calendar (ICU)", () => {
  const fmt = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  it("agrees on every day from 1990 to 2060", () => {
    const mismatches: string[] = [];
    const start = Date.UTC(1990, 0, 1);
    const end = Date.UTC(2060, 11, 31);
    for (let t = start; t <= end; t += 86_400_000) {
      const d = new Date(t);
      const ours = toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
      const icu = { jy: Number(String(parts.year).replace(/\D/g, "")), jm: Number(parts.month), jd: Number(parts.day) };
      if (ours.jy !== icu.jy || ours.jm !== icu.jm || ours.jd !== icu.jd) {
        mismatches.push(`${d.toISOString().slice(0, 10)} ours=${JSON.stringify(ours)} icu=${JSON.stringify(icu)}`);
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });
});

describe("round trips", () => {
  it("Gregorian → Jalali → Gregorian is identity across 150 years", () => {
    for (let t = Date.UTC(1950, 0, 1); t <= Date.UTC(2100, 0, 1); t += 86_400_000 * 7) {
      const d = new Date(t);
      const g = { gy: d.getUTCFullYear(), gm: d.getUTCMonth() + 1, gd: d.getUTCDate() };
      const j = toJalali(g.gy, g.gm, g.gd);
      expect(toGregorian(j.jy, j.jm, j.jd)).toEqual(g);
    }
  });
});

describe("leap years and month lengths", () => {
  it("identifies leap years", () => {
    for (const y of [1391, 1395, 1399, 1403, 1408]) expect(isJalaliLeapYear(y)).toBe(true);
    for (const y of [1400, 1401, 1402, 1404, 1405, 1406, 1407]) expect(isJalaliLeapYear(y)).toBe(false);
  });
  it("returns month lengths", () => {
    expect(jalaliMonthLength(1405, 1)).toBe(31);
    expect(jalaliMonthLength(1405, 6)).toBe(31);
    expect(jalaliMonthLength(1405, 7)).toBe(30);
    expect(jalaliMonthLength(1405, 11)).toBe(30);
    expect(jalaliMonthLength(1403, 12)).toBe(30);
    expect(jalaliMonthLength(1404, 12)).toBe(29);
  });
  it("validates dates", () => {
    expect(isValidJalaliDate(1403, 12, 30)).toBe(true);
    expect(isValidJalaliDate(1404, 12, 30)).toBe(false);
    expect(isValidJalaliDate(1405, 7, 31)).toBe(false);
    expect(isValidJalaliDate(1405, 13, 1)).toBe(false);
    expect(isValidJalaliDate(1405, 0, 1)).toBe(false);
  });
});

describe("addJalaliMonths", () => {
  it("rolls over years in both directions", () => {
    expect(addJalaliMonths(1405, 12, 1)).toEqual({ jy: 1406, jm: 1 });
    expect(addJalaliMonths(1405, 1, -1)).toEqual({ jy: 1404, jm: 12 });
    expect(addJalaliMonths(1405, 7, -18)).toEqual({ jy: 1404, jm: 1 });
    expect(addJalaliMonths(1405, 7, 0)).toEqual({ jy: 1405, jm: 7 });
  });
});
