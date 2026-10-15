import { normalizeDigits } from "@/lib/format/text";

/**
 * Canonical form of an SMS/notification body for parsing:
 * Western digits, Persian yeh/kaf, ZWNJ → space, markdown asterisks removed (but masked
 * card numbers like 6037****1234 kept), whitespace tidied per line, empty lines dropped.
 */
export function normalizeSmsBody(body: string): string {
  return normalizeDigits(body)
    .replace(/\r\n?/g, "\n")
    .replace(/[يى]/g, "ی") // ي ى → ی
    .replace(/ك/g, "ک") // ك → ک
    .replace(/ـ/g, "") // tatweel
    .replace(/[‌‏‎‪-‮⁦-⁩]/g, " ") // ZWNJ and bidi marks
    .replace(/\*+/g, (run, offset: number, s: string) => {
      const before = s[offset - 1] ?? "";
      const after = s[offset + run.length] ?? "";
      return /\d/.test(before) && /\d/.test(after) ? run : ""; // keep masks between digits only
    })
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Lower-cased alphanumerics only: "+98 986-715000" → "98986715000", "Bank Mellat" → "bankmellat". */
export function normalizeSender(sender: string): string {
  return normalizeDigits(sender)
    .toLowerCase()
    .replace(/[^a-z0-9؀-ۿ]/g, "");
}

/**
 * True when an incoming sender matches a configured sender ID. Tolerates country-code
 * prefixes (+98 / 0098) by accepting a suffix match of at least 5 characters.
 */
export function senderMatches(incoming: string, configured: string): boolean {
  const a = normalizeSender(incoming);
  const b = normalizeSender(configured);
  if (!a || !b) return false;
  if (a === b) return true;
  const [short, long] = a.length < b.length ? [a, b] : [b, a];
  return short.length >= 5 && /^\d+$/.test(short) && long.endsWith(short);
}
