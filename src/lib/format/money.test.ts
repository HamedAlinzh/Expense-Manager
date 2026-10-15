import { describe, expect, it } from "vitest";
import {
  formatMoney,
  parseAmountToRial,
  parseRialAmount,
  parseThousandTomanToRial,
  rialToUnit,
  signedRial,
  tomanToRial,
} from "./money";

describe("parseThousandTomanToRial (bot input)", () => {
  it.each([
    ["50", 500_000],
    ["12.5", 125_000],
    ["۱۲۰", 1_200_000],
    ["٣٠٠٠", 30_000_000],
    ["3000", 30_000_000],
    ["0.5", 5_000],
    [".5", 5_000],
    ["12.50", 125_000],
    ["1,250", 12_500_000],
    ["۱٬۲۵۰", 12_500_000],
    ["1،250", 12_500_000],
    ["12٫5", 125_000],
    ["۱۲٫۵", 125_000],
    ["0.0001", 1],
    ["1,234,567.8912", 12_345_678_912],
    [" 75 ", 750_000],
    ["0", 0],
  ])("%s → %d Rial", (input, expected) => {
    expect(parseThousandTomanToRial(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "abc",
    "-5",
    "+5",
    "12.",
    "1.2.3",
    "12.34567", // finer than one Rial
    "1,25", // malformed grouping
    "12,5",
    ",500",
    "1,2345",
    "5e3",
    "Infinity",
    "999999999999999999",
  ])("rejects %j", (input) => {
    expect(parseThousandTomanToRial(input)).toBeNull();
  });
});

describe("parseAmountToRial in other units", () => {
  it("toman allows one decimal (= 1 Rial)", () => {
    expect(parseAmountToRial("12.5", "toman")).toBe(125);
    expect(parseAmountToRial("50,000", "toman")).toBe(500_000);
    expect(parseAmountToRial("12.55", "toman")).toBeNull();
  });
  it("rial must be a whole number", () => {
    expect(parseAmountToRial("500,000", "rial")).toBe(500_000);
    expect(parseAmountToRial("12.5", "rial")).toBeNull();
    expect(parseAmountToRial("12.0", "rial")).toBe(12);
  });
  it("never produces a non-integer", () => {
    for (const s of ["0.1", "0.3", "1.7", "123.4567", "99.9999"]) {
      const r = parseAmountToRial(s, "thousand_toman");
      expect(Number.isInteger(r)).toBe(true);
    }
    // classic float trap: 0.1 + 0.2
    expect(parseAmountToRial("0.3", "thousand_toman")).toBe(3_000);
  });
});

describe("parseRialAmount (bank SMS)", () => {
  it.each([
    ["1,250,000", 1_250_000],
    ["۱٬۲۵۰٬۰۰۰", 1_250_000],
    ["١،٢٥٠،٠٠٠", 1_250_000],
    ["1250000", 1_250_000],
    ["12 500", 12_500],
    ["0", 0],
  ])("%s → %d", (input, expected) => expect(parseRialAmount(input)).toBe(expected));
  it.each(["", "12.5", "abc", "-100", "99999999999999999999"])("rejects %j", (input) =>
    expect(parseRialAmount(input)).toBeNull(),
  );
});

describe("unit conversion", () => {
  it("converts between Rial and display units", () => {
    expect(rialToUnit(500_000, "toman")).toBe(50_000);
    expect(rialToUnit(500_000, "thousand_toman")).toBe(50);
    expect(rialToUnit(500_000, "rial")).toBe(500_000);
    expect(tomanToRial(50_000)).toBe(500_000);
  });
});

describe("formatMoney", () => {
  it("defaults to Toman with Latin digits", () => expect(formatMoney(500_000)).toBe("50,000 T"));
  it("formats Persian style", () => expect(formatMoney(500_000, { digits: "persian" })).toBe("۵۰٬۰۰۰ تومان"));
  it("supports thousand Toman and Rial", () => {
    expect(formatMoney(500_000, { unit: "thousand_toman" })).toBe("50 kT");
    expect(formatMoney(125_000, { unit: "thousand_toman" })).toBe("12.5 kT");
    expect(formatMoney(500_000, { unit: "rial" })).toBe("500,000 IRR");
  });
  it("shows sub-Toman precision instead of hiding it", () => expect(formatMoney(125_005)).toBe("12,500.5 T"));
  it("handles signs", () => {
    expect(formatMoney(-500_000)).toBe("−50,000 T");
    expect(formatMoney(500_000, { sign: "always" })).toBe("+50,000 T");
    expect(formatMoney(-500_000, { sign: "never" })).toBe("50,000 T");
    expect(formatMoney(0, { sign: "always" })).toBe("0 T");
  });
  it("supports compact and unit-less output", () => {
    expect(formatMoney(125_000_000, { compact: true })).toBe("12.5M T");
    expect(formatMoney(500_000, { withUnit: false })).toBe("50,000");
  });
});

describe("signedRial", () => {
  it("negates expenses, keeps income/refunds, zeroes transfers", () => {
    expect(signedRial("expense", 100)).toBe(-100);
    expect(signedRial("income", 100)).toBe(100);
    expect(signedRial("refund", 100)).toBe(100);
    expect(signedRial("transfer", 100)).toBe(0);
  });
});
