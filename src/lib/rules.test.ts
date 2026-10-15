import { describe, expect, it } from "vitest";
import { applyRules, matchesRule, type RuleLike, validatePattern } from "./rules";

let nextId = 1;
const rule = (p: Partial<RuleLike>): RuleLike => ({
  id: nextId++,
  matchField: "merchant",
  matchType: "contains",
  pattern: "x",
  categoryId: 1,
  categoryKind: "expense",
  setType: null,
  priority: 100,
  enabled: true,
  ...p,
});

describe("matchesRule", () => {
  it("contains is case-, digit- and Arabic-letter-insensitive", () => {
    expect(matchesRule(rule({ pattern: "snapp" }), { merchant: "SNAPP Ride #123" })).toBe(true);
    expect(matchesRule(rule({ pattern: "کافی شاپ" }), { merchant: "كافي شاپ لمیز" })).toBe(true);
    expect(matchesRule(rule({ pattern: "پایانه 12" }), { merchant: "پایانه ۱۲" })).toBe(true);
  });
  it("merchant rules fall back to description", () => {
    expect(matchesRule(rule({ pattern: "taxi" }), { merchant: null, description: "taxi home" })).toBe(true);
    expect(matchesRule(rule({ pattern: "taxi" }), { merchant: "Snapp", description: "taxi home" })).toBe(false);
  });
  it("equals compares normalized whole values", () => {
    expect(matchesRule(rule({ matchType: "equals", pattern: "Rent" }), { merchant: " rent " })).toBe(true);
    expect(matchesRule(rule({ matchType: "equals", pattern: "Rent" }), { merchant: "rent june" })).toBe(false);
  });
  it("regex matches original and digit-normalized text", () => {
    const r = rule({ matchField: "raw_text", matchType: "regex", pattern: "حقوق\\s+مهر" });
    expect(matchesRule(r, { rawText: "واریز حقوق مهر ماه" })).toBe(true);
    expect(
      matchesRule(rule({ matchField: "description", matchType: "regex", pattern: "^bill \\d{4}$" }), {
        description: "bill ۱۴۰۵",
      }),
    ).toBe(true);
  });
  it("invalid regex and empty fields never match", () => {
    expect(matchesRule(rule({ matchType: "regex", pattern: "(" }), { merchant: "(" })).toBe(false);
    expect(matchesRule(rule({ pattern: "a" }), {})).toBe(false);
    expect(matchesRule(rule({ pattern: "   " }), { merchant: "abc" })).toBe(false);
  });
});

describe("applyRules", () => {
  it("picks the lowest priority enabled rule", () => {
    const rules = [
      rule({ pattern: "snapp", categoryId: 10, priority: 50 }),
      rule({ pattern: "snapp food", categoryId: 20, priority: 10 }),
      rule({ pattern: "snapp", categoryId: 30, priority: 1, enabled: false }),
    ];
    expect(applyRules(rules, { merchant: "Snapp Food" })?.categoryId).toBe(20);
    expect(applyRules(rules, { merchant: "Snapp" })?.categoryId).toBe(10);
  });
  it("skips rules whose category kind doesn't fit the transaction type", () => {
    const rules = [
      rule({ pattern: "refund", categoryId: 1, categoryKind: "expense", priority: 1 }),
      rule({ pattern: "refund", categoryId: 2, categoryKind: "income", priority: 2 }),
    ];
    expect(applyRules(rules, { description: "refund" }, "income")?.categoryId).toBe(2);
    expect(applyRules(rules, { description: "refund" }, "expense")?.categoryId).toBe(1);
    expect(applyRules(rules, { description: "refund" }, "transfer")).toBeNull();
  });
  it("rules that set a type apply regardless of the incoming type", () => {
    const rules = [
      rule({ matchField: "raw_text", pattern: "حقوق", categoryId: 5, categoryKind: "income", setType: "income" }),
    ];
    expect(applyRules(rules, { rawText: "واریز حقوق" }, "expense")).toEqual({
      ruleId: rules[0]!.id,
      categoryId: 5,
      setType: "income",
    });
  });
  it("returns null when nothing matches", () => {
    expect(applyRules([rule({ pattern: "zzz" })], { merchant: "abc" })).toBeNull();
  });
});

describe("validatePattern", () => {
  it("validates patterns", () => {
    expect(validatePattern("contains", "")).toMatch(/required/);
    expect(validatePattern("regex", "(")).toMatch(/Invalid/);
    expect(validatePattern("regex", "^a.+b$")).toBeNull();
    expect(validatePattern("contains", "x".repeat(201))).toMatch(/200/);
  });
});
