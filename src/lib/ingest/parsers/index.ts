import { normalizeSmsBody } from "../normalize";
import { extractTransaction } from "./extract";
import { COMMON_KEYWORDS, PROFILES } from "./profiles";
import type { BankProfile, ParseContext, ParseResult } from "./types";

export type { Bank, ParseContext, ParseResult } from "./types";

/** Profiles that plausibly apply: matched cards' banks first, then body markers, then sender hints. */
function candidateProfiles(body: string, ctx: ParseContext): BankProfile[] {
  const text = normalizeSmsBody(body);
  const out: BankProfile[] = [];
  const push = (p: BankProfile | undefined) => p && !out.includes(p) && out.push(p);
  for (const b of ctx.bankHints ?? []) push(PROFILES.find((p) => p.bank === b));
  for (const p of PROFILES) if (p.bodyMarkers.some((re) => re.test(text))) push(p);
  if (ctx.sender) for (const p of PROFILES) if (p.senderHints.some((re) => re.test(ctx.sender!))) push(p);
  return out;
}

/**
 * Runs every applicable bank parser plus the generic fallback and returns the most
 * confident result (null when nothing could extract an amount and direction).
 */
export function parseMessage(body: string, ctx: ParseContext): ParseResult | null {
  const results: ParseResult[] = [];
  for (const profile of candidateProfiles(body, ctx)) {
    const r = extractTransaction(body, profile, profile.keywords, ctx, profile.id);
    if (r) results.push(r);
  }
  const generic = extractTransaction(body, null, COMMON_KEYWORDS, ctx, "generic");
  if (generic) results.push({ ...generic, confidence: Math.min(generic.confidence, 0.85) }); // generic never auto-confirms
  results.sort((a, b) => b.confidence - a.confidence);
  return results[0] ?? null;
}

export function detectBank(body: string, ctx: Omit<ParseContext, "receivedAt">) {
  return candidateProfiles(body, { ...ctx, receivedAt: new Date() })[0]?.bank ?? null;
}
