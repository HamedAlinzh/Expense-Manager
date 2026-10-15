import { describe, expect, it } from "vitest";
import { jalaliToUtc } from "@/lib/format/time";
import { anomalyCheck, deliveryTime, newThreshold } from "./alerts";
import { detectSeries, nextExpected, priceChange, recurringKey, type RecurringTx, yearlyCost } from "./recurring";

const iso = (d: Date) => d.toISOString();

describe("deliveryTime (quiet hours 23:00–08:00 Tehran)", () => {
  it("delivers immediately during the day", () => {
    const noon = new Date("2026-10-15T08:30:00Z"); // 12:00 Tehran
    expect(deliveryTime(noon)).toBe(noon);
  });
  it("holds late-evening alerts until 08:00 next day", () => {
    expect(iso(deliveryTime(new Date("2026-10-15T20:00:00Z")))).toBe("2026-10-16T04:30:00.000Z"); // 23:30 → 08:00
  });
  it("holds early-morning alerts until 08:00 the same day", () => {
    expect(iso(deliveryTime(new Date("2026-10-15T00:00:00Z")))).toBe("2026-10-15T04:30:00.000Z"); // 03:30 → 08:00
  });
});

describe("newThreshold", () => {
  it("returns the highest newly reached threshold", () => {
    expect(newThreshold(85, 100, [80, 100], new Set())).toBe(80);
    expect(newThreshold(110, 100, [80, 100], new Set())).toBe(100);
    expect(newThreshold(110, 100, [80, 100], new Set([80]))).toBe(100);
  });
  it("returns null when nothing new was reached", () => {
    expect(newThreshold(79, 100, [80, 100], new Set())).toBeNull();
    expect(newThreshold(90, 100, [80, 100], new Set([80]))).toBeNull();
    expect(newThreshold(120, 100, [80, 100], new Set([100]))).toBeNull();
    expect(newThreshold(10, 0, [80], new Set())).toBeNull();
    expect(newThreshold(85, 100, [80, 100], new Set([100]))).toBeNull(); // 100% already sent, then spending dropped
  });
});

describe("anomalyCheck", () => {
  const coffees = [900_000, 1_000_000, 1_100_000, 950_000, 1_050_000, 1_000_000];
  it("flags an amount far above the usual", () => {
    expect(anomalyCheck(4_500_000, coffees)).toEqual({ anomalous: true, typicalRial: 1_000_000 });
  });
  it("ignores normal variation, thin history and small amounts", () => {
    expect(anomalyCheck(1_400_000, coffees).anomalous).toBe(false);
    expect(anomalyCheck(9_000_000, coffees.slice(0, 3)).anomalous).toBe(false);
    expect(anomalyCheck(1_500_000, [100_000, 120_000, 90_000, 110_000, 100_000]).anomalous).toBe(false); // below minimum size
  });
  it("is robust to a single earlier outlier", () => {
    expect(anomalyCheck(5_000_000, [...coffees, 20_000_000]).anomalous).toBe(true);
  });
});

describe("recurringKey", () => {
  it("normalizes merchants and drops digits", () => {
    expect(recurringKey("Spotify", "")).toBe("spotify");
    expect(recurringKey(null, "Irancell 0912")).toBe("irancell");
    expect(recurringKey(null, "اجاره خانه")).toBe("اجاره خانه");
  });
  it("rejects channel-only SMS descriptions", () => {
    expect(recurringKey(null, "برداشت · پایانه فروش")).toBeNull();
    expect(recurringKey(null, "خرید اینترنتی")).toBeNull();
    expect(recurringKey(null, "ab")).toBeNull();
  });
});

const monthly = (amounts: number[], startJm = 3): RecurringTx[] =>
  amounts.map((a, i) => ({
    id: i + 1,
    amountRial: a,
    occurredAt: jalaliToUtc({ jy: 1405, jm: startJm + i, jd: 9, hour: 10 }),
    display: "Filimo",
    cardId: 4,
    categoryId: 11,
  }));

describe("detectSeries", () => {
  it("detects a monthly subscription and its price change", () => {
    const d = detectSeries("spotify", monthly([2_100_000, 2_100_000, 2_100_000, 2_400_000]))!;
    expect(d).toMatchObject({
      interval: "monthly",
      occurrences: 4,
      typicalAmountRial: 2_100_000,
      lastAmountRial: 2_400_000,
    });
    expect(iso(d.nextExpectedAt)).toBe(iso(jalaliToUtc({ jy: 1405, jm: 7, jd: 9, hour: 10 })));
    expect(priceChange(d)).toBeCloseTo(0.1429, 3);
  });
  it("detects weekly series", () => {
    const txs = [0, 7, 14, 21].map((d, i) => ({
      id: i,
      amountRial: 500_000,
      occurredAt: new Date(Date.UTC(2026, 8, 1 + d)),
      display: "Gym",
      cardId: null,
      categoryId: null,
    }));
    expect(detectSeries("gym", txs)?.interval).toBe("weekly");
  });
  it("rejects irregular gaps or unstable amounts", () => {
    const irregular = [1, 4, 30, 33, 70].map((d, i) => ({
      id: i,
      amountRial: 1_000_000,
      occurredAt: new Date(Date.UTC(2026, 0, d)),
      display: "x",
      cardId: null,
      categoryId: null,
    }));
    expect(detectSeries("x", irregular)).toBeNull();
    expect(detectSeries("x", monthly([1_000_000, 3_000_000, 500_000, 2_000_000]))).toBeNull();
    expect(detectSeries("x", monthly([1_000_000, 1_000_000]))).toBeNull(); // too few for monthly
  });
  it("clamps the next month's day (31 Shahrivar → 30 Mehr)", () => {
    expect(iso(nextExpected(jalaliToUtc({ jy: 1405, jm: 6, jd: 31, hour: 9 }), "monthly"))).toBe(
      iso(jalaliToUtc({ jy: 1405, jm: 7, jd: 30, hour: 9 })),
    );
  });
  it("computes yearly cost", () => {
    expect(yearlyCost(2_100_000, "monthly")).toBe(25_200_000);
    expect(yearlyCost(500_000, "weekly")).toBe(26_000_000);
  });
});
