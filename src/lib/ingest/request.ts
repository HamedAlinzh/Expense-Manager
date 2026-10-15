import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { normalizeDigits } from "@/lib/format/text";

/** Constant-time comparison of a presented token against the configured one (hashing equalizes length). */
export function tokenMatches(presented: string | null, expected: string): boolean {
  if (!presented) return false;
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Accepts ISO 8601, epoch milliseconds or seconds (number or numeric string). Anything else, or a
 * time more than 5 minutes in the future, falls back to `now` — the body's own date usually wins anyway.
 */
export function parseReceivedAt(value: unknown, now = new Date()): Date {
  let d: Date | null = null;
  if (typeof value === "number" || (typeof value === "string" && /^\d{9,13}$/.test(value.trim()))) {
    const n = Number(value);
    d = new Date(n < 1e12 ? n * 1000 : n);
  } else if (typeof value === "string" && value.trim()) {
    const parsed = new Date(normalizeDigits(value.trim()));
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  if (!d || Number.isNaN(d.getTime()) || d.getTime() - now.getTime() > 5 * 60_000) return now;
  return d;
}

export const ingestBodySchema = z.object({
  sender: z.string().trim().min(1).max(100),
  body: z.string().min(1).max(4000),
  received_at: z.union([z.string(), z.number()]).optional(),
  source: z.enum(["sms", "notification"]).default("sms"),
});

/**
 * Reads JSON or form-encoded payloads. MacroDroid inserts raw SMS text into JSON templates without
 * escaping newlines, so an unparseable single-line template gets its newlines escaped and is retried.
 */
export function readPayload(contentType: string, text: string): unknown {
  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  try {
    return JSON.parse(text);
  } catch {
    try {
      return JSON.parse(text.replace(/\r\n|\r|\n/g, "\\n").replace(/\t/g, "\\t"));
    } catch {
      return null;
    }
  }
}
