import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { jalaliToUtc } from "@/lib/format/time";
import { parseFixture } from "./fixture-file";
import { parseMessage } from "./parsers";
import { detectOtp, maskCardNumbers } from "./security";

const ROOT = path.resolve(import.meta.dirname, "../../../fixtures/sms");

function fixtureFiles(): { bank: string; name: string; file: string }[] {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(path.join(ROOT, d.name))
        .filter((f) => f.endsWith(".txt"))
        .map((f) => ({ bank: d.name, name: f, file: path.join(ROOT, d.name, f) })),
    );
}

function jalaliInstant(s: string): Date {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`bad expect.occurred_at: ${s}`);
  return jalaliToUtc({ jy: +m[1]!, jm: +m[2]!, jd: +m[3]!, hour: +m[4]!, minute: +m[5]! });
}

describe("SMS fixtures", () => {
  const files = fixtureFiles();
  it("found fixtures for every bank folder", () => {
    expect(new Set(files.map((f) => f.bank))).toEqual(new Set(["mellat", "tejarat", "sepah", "blu", "generic", "otp"]));
  });

  for (const { bank, name, file } of files) {
    it(`${bank}/${name}`, () => {
      const { meta, body } = parseFixture(readFileSync(file, "utf8"));
      const otp = detectOtp(body);
      if (meta["expect.otp"] === "true") {
        expect(otp.isOtp, "should be detected as OTP").toBe(true);
        return;
      }
      expect(otp.isOtp, `false OTP positive (${otp.reason})`).toBe(false);
      expect(maskCardNumbers(body).masked, "no full card number should be masked in this fixture").toBe(0);

      const receivedAt = new Date(meta.received_at ?? "2026-10-15T12:00:00+03:30");
      const r = parseMessage(body, { receivedAt, sender: meta.sender });
      if (meta["expect.parse"] === "false") {
        expect(r).toBeNull();
        return;
      }
      expect(r, "parser returned nothing").not.toBeNull();
      if (!r) return;
      if (meta["expect.type"]) expect(r.type).toBe(meta["expect.type"]);
      if (meta["expect.amount_rial"]) expect(r.amountRial).toBe(Number(meta["expect.amount_rial"]));
      if (meta["expect.balance_after_rial"]) expect(r.balanceAfterRial).toBe(Number(meta["expect.balance_after_rial"]));
      if (meta["expect.identifier"]) expect(r.identifier).toBe(meta["expect.identifier"]);
      if (meta["expect.description"]) expect(r.description).toBe(meta["expect.description"]);
      if (meta["expect.bank"]) expect(r.bank).toBe(meta["expect.bank"]);
      if (meta["expect.occurred_at"])
        expect(r.occurredAt.toISOString()).toBe(jalaliInstant(meta["expect.occurred_at"]).toISOString());
      if (meta["expect.min_confidence"])
        expect(r.confidence, r.notes.join("; ")).toBeGreaterThanOrEqual(Number(meta["expect.min_confidence"]));
      if (meta["expect.max_confidence"])
        expect(r.confidence).toBeLessThanOrEqual(Number(meta["expect.max_confidence"]));
    });
  }
});
