import { describe, expect, it } from "vitest";
import { bar, categoryEmoji, esc, toman, txLine } from "./format";

describe("telegram formatting", () => {
  it("escapes HTML", () => expect(esc("<b>A & B</b>")).toBe("&lt;b&gt;A &amp; B&lt;/b&gt;"));
  it("formats Toman", () => {
    expect(toman(500_000)).toBe("50,000 T");
    expect(toman(-500_000, { sign: "always" })).toBe("−50,000 T");
  });
  it("renders transaction lines with sign and escaped text", () => {
    const at = new Date("2026-10-15T11:02:00Z");
    expect(
      txLine({
        type: "expense",
        direction: "out",
        amountRial: 500_000,
        description: "<lunch>",
        merchant: null,
        occurredAt: at,
      }),
    ).toBe("<b>−50,000 T</b>  &lt;lunch&gt; · <i>14:32</i>");
    expect(
      txLine(
        { type: "income", direction: "in", amountRial: 10, description: "x", merchant: "Shop", occurredAt: at },
        { withDate: true },
      ),
    ).toBe("<b>+1 T</b>  Shop · <i>1405/07/23 — 14:32</i>");
  });
  it("draws bars and falls back for unknown icons", () => {
    expect(bar(0.62)).toBe("▓▓▓▓▓▓░░░░");
    expect(bar(1.4, 4)).toBe("▓▓▓▓");
    expect(categoryEmoji("utensils")).toBe("🍽");
    expect(categoryEmoji("nope")).toBe("🏷");
  });
});
