import { describe, expect, it } from "vitest";
import { activeFilterCount, createTransactionSchema, emptyFilters, filtersToParams, parseFilters } from "./transaction";

describe("transaction filters", () => {
  it("round-trips through URL params", () => {
    const f = {
      ...emptyFilters,
      q: "snapp",
      from: "2026-09-23",
      to: "2026-10-22",
      cards: [1, 3],
      categories: [0, 5],
      types: ["expense" as const],
      tags: ["work"],
      minRial: 100_000,
      maxRial: 5_000_000,
      status: "pending_review" as const,
      sources: ["sms" as const],
      page: 3,
    };
    expect(parseFilters(filtersToParams(f))).toEqual(f);
  });
  it("drops malformed values instead of throwing", () => {
    const f = parseFilters(
      new URLSearchParams("card=1,x,-2&type=expense,bogus&from=2026-02-30&min=12.5&status=nope&page=-4"),
    );
    expect(f.cards).toEqual([1]);
    expect(f.types).toEqual(["expense"]);
    expect(f.from).toBeUndefined();
    expect(f.minRial).toBeUndefined();
    expect(f.status).toBeUndefined();
    expect(f.page).toBe(1);
  });
  it("omits defaults and counts active filters", () => {
    expect(filtersToParams(emptyFilters).toString()).toBe("");
    expect(activeFilterCount(emptyFilters)).toBe(0);
    expect(activeFilterCount({ ...emptyFilters, from: "2026-10-01", to: "2026-10-31", q: "x" })).toBe(2);
  });
});

describe("createTransactionSchema", () => {
  const base = {
    amountRial: 500_000,
    date: "2026-10-15",
    time: "14:32",
    description: " lunch ",
    tags: ["#Work", "work"],
    note: null,
  };
  it("accepts an expense and normalizes tags/description", () => {
    const r = createTransactionSchema.parse({ ...base, type: "expense", cardId: 1, categoryId: null, merchant: null });
    expect(r.description).toBe("lunch");
    expect(r.tags).toEqual(["work"]);
  });
  it("rejects zero, fractional and unsafe amounts", () => {
    for (const amountRial of [0, 1.5, -10, Number.MAX_SAFE_INTEGER + 2]) {
      expect(
        createTransactionSchema.safeParse({
          ...base,
          amountRial,
          type: "expense",
          cardId: 1,
          categoryId: null,
          merchant: null,
        }).success,
      ).toBe(false);
    }
  });
  it("requires two different cards for transfers", () => {
    expect(createTransactionSchema.safeParse({ ...base, type: "transfer", fromCardId: 1, toCardId: 1 }).success).toBe(
      false,
    );
    expect(createTransactionSchema.safeParse({ ...base, type: "transfer", fromCardId: 1, toCardId: 2 }).success).toBe(
      true,
    );
  });
  it("validates date and time", () => {
    expect(
      createTransactionSchema.safeParse({
        ...base,
        date: "2026-13-01",
        type: "expense",
        cardId: 1,
        categoryId: null,
        merchant: null,
      }).success,
    ).toBe(false);
    expect(
      createTransactionSchema.safeParse({
        ...base,
        time: "24:00",
        type: "expense",
        cardId: 1,
        categoryId: null,
        merchant: null,
      }).success,
    ).toBe(false);
  });
});
