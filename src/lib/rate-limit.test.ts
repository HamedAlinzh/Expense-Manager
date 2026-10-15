import { describe, expect, it } from "vitest";
import { clientIp, rateLimit, resetRateLimit } from "./rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit, then blocks until the window resets", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k1", 3, 60_000, t0).ok).toBe(true);
    const blocked = rateLimit("k1", 3, 60_000, t0 + 1000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(59);
    expect(rateLimit("k1", 3, 60_000, t0 + 60_001).ok).toBe(true);
  });
  it("tracks keys independently and can be reset", () => {
    expect(rateLimit("a", 1, 60_000, 0).ok).toBe(true);
    expect(rateLimit("a", 1, 60_000, 1).ok).toBe(false);
    expect(rateLimit("b", 1, 60_000, 1).ok).toBe(true);
    resetRateLimit("a");
    expect(rateLimit("a", 1, 60_000, 2).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("uses the first X-Forwarded-For entry (set by Caddy)", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "5.6.7.8, 10.0.0.1" }))).toBe("5.6.7.8");
  });
  it("falls back when no proxy headers exist", () => {
    expect(clientIp(new Headers())).toBe("local");
  });
});
