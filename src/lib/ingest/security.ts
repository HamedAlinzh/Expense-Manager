import { normalizeSmsBody } from "./normalize";

const OTP_PATTERNS: RegExp[] = [
  /رمز\s*(?:پویا|دوم|یکبار|یک\s*بار|اینترنتی|عبور|موقت)/,
  /(?<!\p{L})رمز(?!\p{L})/u, // standalone "رمز" (\b does not work for Persian letters)
  /کد\s*(?:تایید|تأیید|ورود|فعال\s*سازی|امنیتی|یکبار)/,
  /\b(?:otp|one[\s-]*time|passcode|password|verification|verify|login code|security code)\b/i,
  /\bcode\b/i,
];

/**
 * Detects one-time passwords / login codes. Such messages are discarded unparsed and their
 * body is never stored, logged, or sent anywhere (including the AI parser).
 */
export function detectOtp(body: string): { isOtp: boolean; reason: string | null } {
  const text = normalizeSmsBody(body);
  for (const re of OTP_PATTERNS) if (re.test(text)) return { isOtp: true, reason: `keyword:${re.source.slice(0, 24)}` };
  // A short message that is essentially a standalone 4–8 digit code.
  const stripped = text.replace(/[^\p{L}\d]+/gu, " ").trim();
  const words = stripped.split(" ").filter(Boolean);
  if (
    words.length <= 6 &&
    words.some((w) => /^\d{4,8}$/.test(w)) &&
    !/مانده|موجودی|ریال|تومان|برداشت|واریز|خرید/.test(text)
  ) {
    return { isOtp: true, reason: "short-numeric-code" };
  }
  return { isOtp: false, reason: null };
}

/** Luhn checksum — real card numbers pass it; tracking codes and dates almost never do. */
export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Masks full 16-digit card numbers (optionally grouped by spaces or dashes) to their last
 * four digits. Only Luhn-valid numbers are masked, so 16-digit tracking codes survive.
 */
export function maskCardNumbers(text: string): { text: string; masked: number } {
  let masked = 0;
  const out = text.replace(
    /(?<![\d*])(\d{4})[ -]?(\d{4})[ -]?(\d{4})[ -]?(\d{4})(?![\d*])/g,
    (match, a: string, b: string, c: string, d: string) => {
      if (!luhnValid(a + b + c + d)) return match;
      masked++;
      return `****${d}`;
    },
  );
  return { text: out, masked };
}
