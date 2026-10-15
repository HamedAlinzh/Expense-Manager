import type { ParsedType } from "./parsers/types";

const tailDigits = (s: string) => (s.split(/\*+/).at(-1) ?? "").replace(/\D/g, "");

/**
 * True when an identifier from a message ("1029384756", "6219****401234", "****1234") refers to a
 * configured fragment ("1234", "401234", "1029384756", "6219****401234"). Compares the digits after
 * the last mask; the shorter must be a suffix of the longer and at least 4 digits.
 */
export function identifierMatches(fromMessage: string, configured: string): boolean {
  const a = tailDigits(fromMessage);
  const b = tailDigits(configured.replace(/[\s-]/g, ""));
  if (a.length < 4 || b.length < 4) return false;
  return a.length >= b.length ? a.endsWith(b) : b.endsWith(a);
}

export type MatchableCard = { id: number; identifierFragments: string[] };

export type CardMatch<C> =
  | { card: C; how: "identifier" | "only-card" | "learned"; learn: string | null; penalty: number }
  | { card: null; how: "none" | "ambiguous"; learn: null; penalty: 0 };

/**
 * Picks the card for a message among `pool` (cards whose sender ID matched, or cards of the
 * detected bank). A single candidate card learns a new identifier automatically; when that card
 * already had other identifiers the match is penalized so the transaction gets reviewed once.
 */
export function matchCard<C extends MatchableCard>(pool: C[], identifier: string | null): CardMatch<C> {
  if (pool.length === 0) return { card: null, how: "none", learn: null, penalty: 0 };
  if (identifier) {
    const hits = pool.filter((c) => c.identifierFragments.some((f) => identifierMatches(identifier, f)));
    if (hits.length === 1) return { card: hits[0]!, how: "identifier", learn: null, penalty: 0 };
    if (hits.length > 1) return { card: null, how: "ambiguous", learn: null, penalty: 0 };
    if (pool.length === 1) {
      const card = pool[0]!;
      return { card, how: "learned", learn: identifier, penalty: card.identifierFragments.length > 0 ? 0.15 : 0 };
    }
    return { card: null, how: "ambiguous", learn: null, penalty: 0 };
  }
  return pool.length === 1
    ? { card: pool[0]!, how: "only-card", learn: null, penalty: 0 }
    : { card: null, how: "ambiguous", learn: null, penalty: 0 };
}

export type BalanceCheck = "consistent" | "flipped" | "unknown";

/**
 * Uses the card's previous balance to verify the direction: previous ± amount must equal the new
 * balance. "flipped" means the arithmetic only works in the opposite direction.
 */
export function checkBalance(
  previous: { balanceRial: number; at: Date } | null,
  parsed: { type: ParsedType; amountRial: number; balanceAfterRial: number | null; occurredAt: Date },
): BalanceCheck {
  if (!previous || parsed.balanceAfterRial === null || previous.at.getTime() > parsed.occurredAt.getTime())
    return "unknown";
  const sign = parsed.type === "expense" ? -1 : 1;
  if (previous.balanceRial + sign * parsed.amountRial === parsed.balanceAfterRial) return "consistent";
  if (previous.balanceRial - sign * parsed.amountRial === parsed.balanceAfterRial) return "flipped";
  return "unknown";
}
