import { describe, expect, it } from "vitest";
import { cleanDisplayText, hasPersian, normalizeDigits, normalizeText, toPersianDigits } from "./text";

describe("normalizeDigits", () => {
  it("converts Persian digits", () => expect(normalizeDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789"));
  it("converts Arabic-Indic digits", () => expect(normalizeDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789"));
  it("leaves Western digits and text alone", () => expect(normalizeDigits("abc 123 خرید")).toBe("abc 123 خرید"));
  it("handles mixed scripts in one string", () => expect(normalizeDigits("۱2٣")).toBe("123"));
});

describe("toPersianDigits", () => {
  it("converts Western digits only", () => expect(toPersianDigits("1405/07/23 14:32")).toBe("۱۴۰۵/۰۷/۲۳ ۱۴:۳۲"));
  it("round-trips with normalizeDigits", () =>
    expect(normalizeDigits(toPersianDigits("9876543210"))).toBe("9876543210"));
});

describe("normalizeText", () => {
  it("unifies Arabic yeh and kaf with Persian forms", () => expect(normalizeText("كافي شاپ")).toBe("کافی شاپ"));
  it("collapses ZWNJ and whitespace", () => expect(normalizeText("  می‌خواهم   خرید ")).toBe("می خواهم خرید"));
  it("lower-cases Latin and normalizes digits", () => expect(normalizeText("SNAPP ۱۲")).toBe("snapp 12"));
  it("removes tatweel and diacritics", () => expect(normalizeText("خـــريدُ")).toBe("خرید"));
});

describe("cleanDisplayText / hasPersian", () => {
  it("fixes letter variants but keeps case", () => expect(cleanDisplayText("  Café  ي ")).toBe("Café ی"));
  it("detects Persian script", () => {
    expect(hasPersian("ناهار")).toBe(true);
    expect(hasPersian("lunch 12")).toBe(false);
  });
});
