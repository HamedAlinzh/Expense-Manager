import { describe, expect, it } from "vitest";
import {
  addDaysToKey,
  dayEnd,
  dayKeyFromJalali,
  dayKeyOf,
  dayStart,
  formatDate,
  formatJalaliMonthKey,
  formatMonthLabel,
  jalaliMonthKeyOf,
  jalaliMonthProgress,
  jalaliMonthRange,
  jalaliToUtc,
  parseDayKey,
  parseMonthKey,
  relativeDayLabel,
  tehranWallTimeToUtc,
  timeAgo,
  toJalaliParts,
} from "./time";

const iso = (d: Date | null) => d?.toISOString();

describe("Tehran wall time ⇄ UTC", () => {
  it("uses +03:30 since DST was abolished (2022)", () => {
    expect(iso(jalaliToUtc({ jy: 1405, jm: 7, jd: 23, hour: 14, minute: 32 }))).toBe("2026-10-15T11:02:00.000Z");
  });
  it("respects historical DST (+04:30 in summer 2020)", () => {
    expect(iso(tehranWallTimeToUtc({ year: 2020, month: 6, day: 1, hour: 12 }))).toBe("2020-06-01T07:30:00.000Z");
    expect(iso(tehranWallTimeToUtc({ year: 2020, month: 1, day: 1, hour: 12 }))).toBe("2020-01-01T08:30:00.000Z");
  });
  it("converts instants to Jalali parts in Tehran, across the UTC midnight boundary", () => {
    // 22:00 UTC on Oct 14 is 01:30 on Oct 15 in Tehran.
    expect(toJalaliParts(new Date("2026-10-14T22:00:00Z"))).toMatchObject({
      jy: 1405,
      jm: 7,
      jd: 23,
      hour: 1,
      minute: 30,
    });
  });
  it("rejects invalid Jalali dates", () => {
    expect(() => jalaliToUtc({ jy: 1404, jm: 12, jd: 30 })).toThrow(RangeError);
  });
});

describe("Jalali months", () => {
  it("returns [start, end) in UTC for Mehr 1405", () => {
    const r = jalaliMonthRange(1405, 7);
    expect(iso(r.start)).toBe("2026-09-22T20:30:00.000Z");
    expect(iso(r.end)).toBe("2026-10-22T20:30:00.000Z");
  });
  it("handles the Esfand → Farvardin year boundary", () => {
    const r = jalaliMonthRange(1404, 12);
    expect(iso(r.start)).toBe("2026-02-19T20:30:00.000Z");
    expect(iso(r.end)).toBe("2026-03-20T20:30:00.000Z");
  });
  it("builds and parses month keys", () => {
    expect(jalaliMonthKeyOf(new Date("2026-10-15T11:00:00Z"))).toBe("1405-07");
    expect(parseMonthKey("1405-07")).toEqual({ jy: 1405, jm: 7 });
    expect(parseMonthKey("1405-13")).toBeNull();
    expect(formatJalaliMonthKey("1405-07")).toBe("Mehr 1405");
  });
  it("reports month progress", () => {
    expect(jalaliMonthProgress(new Date("2026-10-15T11:00:00Z"))).toEqual({
      dayOfMonth: 23,
      daysInMonth: 30,
      daysLeft: 7,
    });
  });
});

describe("day keys", () => {
  it("uses the Tehran local day", () => {
    expect(dayKeyOf(new Date("2026-10-14T21:00:00Z"))).toBe("2026-10-15");
    expect(dayKeyOf(new Date("2026-10-14T20:00:00Z"))).toBe("2026-10-14");
  });
  it("gives day ranges in UTC", () => {
    expect(iso(dayStart("2026-10-15"))).toBe("2026-10-14T20:30:00.000Z");
    expect(iso(dayEnd("2026-10-15"))).toBe("2026-10-15T20:30:00.000Z");
    expect(iso(dayEnd("2026-12-31"))).toBe("2026-12-31T20:30:00.000Z");
  });
  it("validates and shifts keys", () => {
    expect(parseDayKey("2026-02-30")).toBeNull();
    expect(parseDayKey("nope")).toBeNull();
    expect(addDaysToKey("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(dayKeyFromJalali(1405, 7, 23)).toBe("2026-10-15");
  });
});

describe("formatting", () => {
  const d = new Date("2026-10-15T11:02:09Z");
  it("formats Jalali by default", () => {
    expect(formatDate(d)).toBe("1405/07/23");
    expect(formatDate(d, { time: true })).toBe("1405/07/23 — 14:32");
    expect(formatDate(d, { time: true, seconds: true })).toBe("1405/07/23 — 14:32:09");
    expect(formatDate(d, { time: true, digits: "persian" })).toBe("۱۴۰۵/۰۷/۲۳ — ۱۴:۳۲");
    expect(formatDate(d, { shortYear: true })).toBe("05/07/23");
  });
  it("formats Gregorian on request (still Tehran time)", () => {
    expect(formatDate(d, { calendar: "gregorian", time: true })).toBe("2026/10/15 — 14:32");
  });
  it("labels months and relative days", () => {
    expect(formatMonthLabel(d)).toBe("Mehr 1405");
    expect(formatMonthLabel(d, "gregorian")).toBe("October 2026");
    expect(relativeDayLabel(d, "jalali", d)).toBe("Today");
    expect(relativeDayLabel(new Date("2026-10-14T11:00:00Z"), "jalali", d)).toBe("Yesterday");
    expect(relativeDayLabel(new Date("2026-10-10T11:00:00Z"), "jalali", d)).toBe("Saturday, 18 Mehr 1405");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  it.each([
    ["2026-10-15T11:59:50Z", "just now"],
    ["2026-10-15T11:55:00Z", "5 minutes ago"],
    ["2026-10-15T09:00:00Z", "3 hours ago"],
    ["2026-10-14T12:00:00Z", "yesterday"],
    ["2026-10-05T12:00:00Z", "10 days ago"],
    ["2026-07-15T12:00:00Z", "3 months ago"],
  ])("%s → %s", (iso, label) => {
    expect(timeAgo(new Date(iso), now)).toBe(label);
  });
});
