import { describe, expect, it } from "vitest";
import { parseQuickEntry, type QuickCard } from "./quick-entry";

const cards: QuickCard[] = [
  { id: 1, name: "Sepah", aliases: ["sepah", "سپه"] },
  { id: 2, name: "Mellat", aliases: ["mellat", "ملت"] },
  { id: 3, name: "Tejarat", aliases: ["tejarat", "تجارت"] },
  { id: 4, name: "Blu", aliases: ["blu", "blue", "بلو"] },
  { id: 5, name: "Old", aliases: ["old"], archived: true },
];
const DEFAULT = 2;
const q = (t: string) => parseQuickEntry(t, cards, DEFAULT);

describe("parseQuickEntry — spec examples", () => {
  it("50 lunch → 50,000 T expense on the default card", () => {
    expect(q("50 lunch")).toEqual({
      type: "expense",
      amountRial: 500_000,
      description: "lunch",
      cardId: DEFAULT,
      cardNamed: false,
      tags: [],
    });
  });
  it("50 ناهار ملت → card Mellat", () => {
    expect(q("50 ناهار ملت")).toMatchObject({ amountRial: 500_000, description: "ناهار", cardId: 2, cardNamed: true });
  });
  it("۱۲۰ سوپرمارکت بلو → Persian digits, card Blu", () => {
    expect(q("۱۲۰ سوپرمارکت بلو")).toMatchObject({ amountRial: 1_200_000, description: "سوپرمارکت", cardId: 4 });
  });
  it("+3000 salary sepah → income of 3,000,000 T", () => {
    expect(q("+3000 salary sepah")).toMatchObject({
      type: "income",
      amountRial: 30_000_000,
      description: "salary",
      cardId: 1,
    });
  });
  it("12.5 taxi tejarat → 12,500 T", () => {
    expect(q("12.5 taxi tejarat")).toMatchObject({ amountRial: 125_000, description: "taxi", cardId: 3 });
  });
});

describe("parseQuickEntry — more inputs", () => {
  it.each([
    ["lunch 50", 500_000, "lunch"],
    ["٧٥ قهوه", 750_000, "قهوه"],
    ["1,250 rent", 12_500_000, "rent"],
    ["12٫5 تاکسی", 125_000, "تاکسی"],
    ["-80 gift", 800_000, "gift"],
    ["50 coffee 2 cups", 500_000, "coffee 2 cups"],
    ["50", 500_000, ""],
  ])("%j", (text, rial, description) => {
    expect(q(text)).toMatchObject({ amountRial: rial, description });
  });
  it("extracts tags and is case/letter-form insensitive for cards", () => {
    expect(q("40 cinema MELLAT #fun #Fun")).toMatchObject({ cardId: 2, description: "cinema", tags: ["fun"] });
    expect(q("40 كافه ملت")).toMatchObject({ cardId: 2 }); // Arabic kaf in the description doesn't matter
  });
  it("ignores archived cards and uses only the first card word", () => {
    expect(q("40 old thing")).toMatchObject({ cardId: DEFAULT, description: "old thing" });
    expect(q("40 transfer mellat blu")).toMatchObject({ cardId: 2, description: "transfer blu" });
  });
  it.each(["hello there", "", "/today", "0 nothing", "abc 12x", "line one\n50 lunch", "50.123456 too precise"])(
    "rejects %j",
    (text) => {
      expect(q(text)).toBeNull();
    },
  );
  it("returns no card when there is no default and none is named", () => {
    expect(parseQuickEntry("50 lunch", cards, null)?.cardId).toBeNull();
  });
});
