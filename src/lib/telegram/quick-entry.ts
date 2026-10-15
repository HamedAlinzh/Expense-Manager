import { parseThousandTomanToRial } from "@/lib/format/money";
import { normalizeDigits, normalizeText } from "@/lib/format/text";

export type QuickCard = { id: number; name: string; aliases: string[]; archived?: boolean };

export type QuickEntry = {
  type: "expense" | "income";
  amountRial: number;
  description: string;
  cardId: number | null;
  /** True when a card was named in the text (vs. the default card). */
  cardNamed: boolean;
  tags: string[];
};

const AMOUNT_TOKEN = /^([+\-−])?([0-9][0-9,٬،]*(?:[.٫][0-9]+)?)$/;

function amountOf(token: string): { sign: "+" | "-" | null; rial: number } | null {
  const m = AMOUNT_TOKEN.exec(normalizeDigits(token));
  if (!m) return null;
  const rial = parseThousandTomanToRial(m[2]!);
  if (rial === null || rial <= 0) return null;
  return { sign: m[1] === "+" ? "+" : m[1] ? "-" : null, rial };
}

/**
 * Parses a Telegram quick entry. Amounts are in THOUSAND Toman:
 *   "50 lunch"            → 500,000 Rial expense, default card
 *   "50 ناهار ملت"         → card Mellat
 *   "+3000 salary sepah"  → income
 *   "12.5 taxi tejarat #work"
 * The amount may be the first or the last word. Returns null if the text isn't a quick entry.
 */
export function parseQuickEntry(text: string, cards: QuickCard[], defaultCardId: number | null): QuickEntry | null {
  const line = text.trim();
  if (!line || line.includes("\n") || line.startsWith("/")) return null;
  const tokens = line.split(/\s+/);

  const amountIdx = amountOf(tokens[0]!) ? 0 : tokens.length > 1 && amountOf(tokens.at(-1)!) ? tokens.length - 1 : -1;
  if (amountIdx === -1) return null;
  const amount = amountOf(tokens[amountIdx]!)!;
  const rest = tokens.filter((_, i) => i !== amountIdx);

  const tags: string[] = [];
  let cardId: number | null = null;
  const words: string[] = [];
  const active = cards.filter((c) => !c.archived);
  for (const token of rest) {
    if (token.startsWith("#") && token.length > 1) {
      tags.push(token.slice(1).toLowerCase());
      continue;
    }
    const norm = normalizeText(token);
    const card = active.find((c) => [c.name, ...c.aliases].some((a) => normalizeText(a) === norm));
    if (card && cardId === null) {
      cardId = card.id;
      continue;
    }
    words.push(token);
  }

  return {
    type: amount.sign === "+" ? "income" : "expense",
    amountRial: amount.rial,
    description: words.join(" "),
    cardId: cardId ?? defaultCardId,
    cardNamed: cardId !== null,
    tags: [...new Set(tags)],
  };
}
