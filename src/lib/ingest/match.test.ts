import { describe, expect, it } from "vitest";
import { checkBalance, identifierMatches, matchCard } from "./match";

describe("identifierMatches", () => {
  it.each([
    ["1029384756", "1029384756", true],
    ["6219****401234", "1234", true],
    ["6219****401234", "401234", true],
    ["6219****401234", "6219****401234", true],
    ["****1234", "6037991234561234", true],
    ["0112233445566", "5566", true],
    ["6219****401234", "9999", false],
    ["6219****401234", "234", false], // too short
    ["1029384756", "0112233445566", false],
  ])("%s vs %s → %s", (a, b, out) => expect(identifierMatches(a, b)).toBe(out));
});

describe("matchCard", () => {
  const tejarat = { id: 1, identifierFragments: ["0112233445566"] };
  const fresh = { id: 2, identifierFragments: [] as string[] };
  it("matches by identifier", () => {
    expect(matchCard([tejarat, fresh], "0112233445566")).toMatchObject({ card: tejarat, how: "identifier" });
  });
  it("learns the identifier when only one card could be meant", () => {
    expect(matchCard([fresh], "1029384756")).toMatchObject({
      card: fresh,
      how: "learned",
      learn: "1029384756",
      penalty: 0,
    });
  });
  it("learns but penalizes when the only card already had different identifiers", () => {
    expect(matchCard([tejarat], "6219****401234")).toMatchObject({ card: tejarat, how: "learned", penalty: 0.15 });
  });
  it("refuses to guess between several cards", () => {
    expect(matchCard([tejarat, fresh], "9999****123456").card).toBeNull();
    expect(matchCard([tejarat, fresh], null)).toMatchObject({ card: null, how: "ambiguous" });
  });
  it("uses the only card when the message has no identifier", () => {
    expect(matchCard([fresh], null)).toMatchObject({ card: fresh, how: "only-card" });
  });
  it("reports no card for an empty pool", () => {
    expect(matchCard([], "123456").how).toBe("none");
  });
});

describe("checkBalance", () => {
  const at = new Date("2026-09-13T09:00:00Z");
  const later = new Date("2026-09-15T09:41:00Z");
  it("confirms a direction when the arithmetic works (Sepah sample)", () => {
    expect(
      checkBalance(
        { balanceRial: 300_650_000, at },
        { type: "expense", amountRial: 300_060_000, balanceAfterRial: 590_000, occurredAt: later },
      ),
    ).toBe("consistent");
  });
  it("flips a direction that only works the other way", () => {
    expect(
      checkBalance(
        { balanceRial: 458_600, at },
        { type: "expense", amountRial: 1_000_000_000, balanceAfterRial: 1_000_458_600, occurredAt: later },
      ),
    ).toBe("flipped");
  });
  it("stays unknown when other transactions happened in between or data is missing", () => {
    expect(
      checkBalance(
        { balanceRial: 1_000, at },
        { type: "expense", amountRial: 100, balanceAfterRial: 500, occurredAt: later },
      ),
    ).toBe("unknown");
    expect(checkBalance(null, { type: "expense", amountRial: 100, balanceAfterRial: 900, occurredAt: later })).toBe(
      "unknown",
    );
    expect(
      checkBalance(
        { balanceRial: 1_000, at: later },
        { type: "expense", amountRial: 100, balanceAfterRial: 900, occurredAt: at },
      ),
    ).toBe("unknown");
  });
});
