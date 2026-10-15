import { createHash } from "node:crypto";

/**
 * Fingerprint for spotting the same real-world transaction from different sources.
 * Exact-match only (same card, direction, amount, minute); window matching happens in queries.
 */
export function txFingerprint(
  cardId: number | null,
  direction: "in" | "out",
  amountRial: number,
  occurredAt: Date,
): string {
  const minute = Math.floor(occurredAt.getTime() / 60_000);
  return createHash("sha256")
    .update(`${cardId ?? "-"}|${direction}|${amountRial}|${minute}`)
    .digest("hex")
    .slice(0, 32);
}
