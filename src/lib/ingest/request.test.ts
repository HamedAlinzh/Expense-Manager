import { describe, expect, it } from "vitest";
import { ingestBodySchema, parseReceivedAt, readPayload, tokenMatches } from "./request";

describe("tokenMatches", () => {
  it("compares in constant time regardless of length", () => {
    expect(tokenMatches("secret-token-123", "secret-token-123")).toBe(true);
    expect(tokenMatches("secret", "secret-token-123")).toBe(false);
    expect(tokenMatches(null, "x")).toBe(false);
  });
});

describe("parseReceivedAt", () => {
  const now = new Date("2026-10-15T12:00:00Z");
  it.each([
    ["2026-10-15T14:30:00+03:30", "2026-10-15T11:00:00.000Z"],
    [1792063800000, "2026-10-15T11:30:00.000Z"],
    ["1792063800", "2026-10-15T11:30:00.000Z"],
  ])("%j", (input, iso) => expect(parseReceivedAt(input, now).toISOString()).toBe(iso));
  it("falls back to now for garbage, missing or future values", () => {
    expect(parseReceivedAt("not a date", now)).toBe(now);
    expect(parseReceivedAt(undefined, now)).toBe(now);
    expect(parseReceivedAt("2027-01-01T00:00:00Z", now)).toBe(now);
  });
});

describe("readPayload", () => {
  it("reads form-encoded bodies with newlines", () => {
    const p = readPayload(
      "application/x-www-form-urlencoded",
      new URLSearchParams({ sender: "Bank Mellat", body: "a\nb" }).toString(),
    );
    expect(ingestBodySchema.parse(p)).toMatchObject({ sender: "Bank Mellat", body: "a\nb", source: "sms" });
  });
  it("repairs MacroDroid-style JSON with raw newlines in strings", () => {
    const p = readPayload(
      "application/json",
      '{"sender":"TejaratBank","body":"بانک تجارت\nبرداشت: 10,000","received_at":"1792056600"}',
    );
    expect(ingestBodySchema.parse(p).body).toBe("بانک تجارت\nبرداشت: 10,000");
  });
  it("returns null for unreadable input", () => {
    expect(readPayload("application/json", "{oops")).toBeNull();
  });
});
