import { cleanDisplayText } from "@/lib/format/text";

const NOISE = [
  /\b(?:terminal|term|pos|tid|mid)\s*[:#]?\s*\d+/gi,
  /(?:ترمینال|پایانه|کد\s*پذیرنده|شماره\s*پذیرنده|کد\s*پیگیری|شماره\s*پیگیری|پیگیری)\s*[:#]?\s*\d+/g,
  /\d{4,}/g, // long numbers: terminal ids, references
  /[#*_|~<>[\]{}()"]+/g,
];

/**
 * Cleans a raw merchant/terminal name into a stable display name:
 * strips terminal codes, long numbers and punctuation noise; title-cases Latin words.
 * "SNAPP*RIDE 12345678" → "Snapp Ride", "فروشگاه رفاه ۱۲۳۴۵۶" → "فروشگاه رفاه".
 */
export function normalizeMerchant(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = cleanDisplayText(raw.normalize("NFKC")).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  s = s.replace(/[*_/\\]+/g, " ");
  for (const re of NOISE) s = s.replace(re, " ");
  s = s
    .replace(/[-–—:.,،]+\s*$/g, "")
    .replace(/^\s*[-–—:.,،]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length < 2) return null;
  s = s.replace(/\b([A-Za-z])([A-Za-z']*)\b/g, (_, a: string, b: string) => a.toUpperCase() + b.toLowerCase());
  return s.slice(0, 80);
}
