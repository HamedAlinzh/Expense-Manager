/**
 * Try the SMS parser on a message without touching the database.
 *   npm run parse-sms -- message.txt        (plain text or a fixture file)
 *   pbpaste | npm run parse-sms
 */
import { readFileSync } from "node:fs";
import { formatDate } from "../src/lib/format/time";
import { parseFixture } from "../src/lib/ingest/fixture-file";
import { parseMessage } from "../src/lib/ingest/parsers";
import { detectOtp, maskCardNumbers } from "../src/lib/ingest/security";

const file = process.argv[2];
const raw = file ? readFileSync(file, "utf8") : readFileSync(0, "utf8");
const { meta, body } = /^---\s*$/m.test(raw)
  ? parseFixture(raw)
  : { meta: {} as Record<string, string>, body: raw.trim() };
const receivedAt = meta.received_at ? new Date(meta.received_at) : new Date();

const otp = detectOtp(body);
if (otp.isOtp) {
  console.log(`OTP detected (${otp.reason}) — this message would be discarded.`);
  process.exit(0);
}
const { text, masked } = maskCardNumbers(body);
if (masked) console.log(`Masked ${masked} full card number(s).`);
const r = parseMessage(text, { receivedAt, sender: meta.sender });
if (!r) {
  console.log("No transaction found (would go to the inbox as needs_review).");
  process.exit(0);
}
console.log({
  ...r,
  occurredAtJalali: formatDate(r.occurredAt, { time: true, seconds: true }),
  occurredAt: r.occurredAt.toISOString(),
});
